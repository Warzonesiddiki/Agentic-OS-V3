/**
 * ransomware-detector — Sentinel-owned autonomous ransomware behavior detector.
 *
 * Consumes a stream of filesystem events (from file-watcher or any producer)
 * and applies behavioral heuristics to detect encryption/divergence attacks:
 *   - Mass write/rename burst within a short window.
 *   - High entropy of written content (encrypted data is high-entropy).
 *   - Renames to known ransomware extensions (.crypt, .locked, .xyz, ...).
 *   - Canary file tampering (decoy files we monitor for writes).
 *
 * On threshold breach it emits a critical SIEM event and invokes an injected
 * containment hook (e.g. quarantineAgent / kill-switch) so the OS self-heals.
 * The scoring core is pure and unit-testable.
 */

import { forward } from './siem-forwarder.js';
import { log } from '../lib/logging.js';

export type FsOp = 'write' | 'rename' | 'delete' | 'chmod';

export interface FsEvent {
  path: string;
  op: FsOp;
  size?: number;
  /** Shannon entropy of the written bytes (0..8); supply when known. */
  entropy?: number;
  ts?: number;
  agentId?: string;
}

export interface RansomwareConfig {
  windowMs: number;
  /** Writes within window that trigger suspicion. */
  burstWrites: number;
  /** Renames within window that trigger suspicion. */
  burstRenames: number;
  /** Entropy above which written content is considered "encrypted". */
  highEntropy: number;
  /** How many high-entropy writes in window raise the alarm. */
  encryptedWriteThreshold: number;
  canaryPaths: string[];
}

export interface RansomwareAlert {
  level: 'none' | 'suspicious' | 'critical';
  score: number;
  reasons: string[];
  ts: number;
  agentId?: string;
  samplePaths: string[];
}

const DEFAULT_RANSOM_EXT =
  /\.(crypt|locked|locky|xyz|zzz|encrypt3d|cryptolocker|teslacrypt|cerber|ryk|wncry|wcry|good|kraken|nosu|sage|globe|damaged|void|data_locked)$/i;

const DEFAULT_CONFIG: RansomwareConfig = {
  windowMs: 30_000,
  burstWrites: 120,
  burstRenames: 40,
  highEntropy: 7.2,
  encryptedWriteThreshold: 25,
  canaryPaths: [],
};

export function scoreEvents(
  events: FsEvent[],
  cfg: RansomwareConfig = DEFAULT_CONFIG,
  now = Date.now()
): RansomwareAlert {
  const windowStart = now - cfg.windowMs;
  const recent = events.filter((e) => (e.ts ?? now) >= windowStart);
  const reasons: string[] = [];
  let score = 0;
  const samplePaths = new Set<string>();

  const writes = recent.filter((e) => e.op === 'write');
  const renames = recent.filter((e) => e.op === 'rename');

  if (writes.length >= cfg.burstWrites) {
    score += 35;
    reasons.push(`write-burst:${writes.length}`);
    writes.slice(0, 5).forEach((w) => samplePaths.add(w.path));
  }
  if (renames.length >= cfg.burstRenames) {
    score += 25;
    reasons.push(`rename-burst:${renames.length}`);
    renames.slice(0, 5).forEach((r) => samplePaths.add(r.path));
  }

  const encryptedWrites = writes.filter(
    (w) => w.entropy !== undefined && w.entropy >= cfg.highEntropy
  );
  if (encryptedWrites.length >= cfg.encryptedWriteThreshold) {
    score += 35;
    reasons.push(`high-entropy-writes:${encryptedWrites.length}`);
    encryptedWrites.slice(0, 5).forEach((w) => samplePaths.add(w.path));
  }

  const suspiciousRenames = renames.filter((r) => DEFAULT_RANSOM_EXT.test(r.path));
  if (suspiciousRenames.length > 0) {
    score += 40;
    reasons.push(`ransom-extension:${suspiciousRenames.length}`);
    suspiciousRenames.slice(0, 5).forEach((r) => samplePaths.add(r.path));
  }

  // Canary tamper: any write/delete on a canary path is an immediate critical.
  const canaryHits = recent.filter(
    (e) =>
      cfg.canaryPaths.includes(e.path) &&
      (e.op === 'write' || e.op === 'delete' || e.op === 'rename')
  );
  if (canaryHits.length > 0) {
    score += 50;
    reasons.push(`canary-tamper:${canaryHits.length}`);
    canaryHits.forEach((c) => samplePaths.add(c.path));
  }

  score = Math.min(100, score);
  const level: RansomwareAlert['level'] =
    score >= 80 ? 'critical' : score >= 40 ? 'suspicious' : 'none';
  return { level, score, reasons, ts: now, samplePaths: [...samplePaths].slice(0, 10) };
}

export type ContainmentHook = (alert: RansomwareAlert) => Promise<void> | void;

export class RansomwareDetector {
  private cfg: RansomwareConfig;
  private events: FsEvent[] = [];
  private hook: ContainmentHook | null = null;
  private lastAgentAlert = new Map<string, number>();

  constructor(cfg: RansomwareConfig = DEFAULT_CONFIG, hook: ContainmentHook | null = null) {
    this.cfg = cfg;
    this.hook = hook;
  }

  setConfig(patch: Partial<RansomwareConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
  }

  setContainmentHook(hook: ContainmentHook | null): void {
    this.hook = hook;
  }

  getConfig(): RansomwareConfig {
    return { ...this.cfg };
  }

  /** Ingest a filesystem event; returns the current window alert. */
  async ingest(ev: FsEvent): Promise<RansomwareAlert> {
    const now = ev.ts ?? Date.now();
    this.events.push({ ...ev, ts: now });
    // Prune events outside the window (keep a little slack for scoring).
    const cutoff = now - this.cfg.windowMs * 2;
    if (this.events.length > 5000 || (this.events[0] && (this.events[0].ts ?? 0) < cutoff)) {
      this.events = this.events.filter((e) => (e.ts ?? now) >= cutoff);
    }
    const alert = scoreEvents(this.events, this.cfg, now);
    if (alert.level === 'critical') {
      const agentKey = ev.agentId ?? 'global';
      const last = this.lastAgentAlert.get(agentKey) ?? 0;
      // De-dupe critical alerts per agent to at most once per window.
      if (now - last > this.cfg.windowMs) {
        this.lastAgentAlert.set(agentKey, now);
        await this.escalate(alert).catch((e) =>
          log.error('ransomware escalate failed', { error: String(e) })
        );
        if (this.hook) {
          try {
            await this.hook(alert);
          } catch (e) {
            log.error('ransomware containment hook failed', { error: String(e) });
          }
        }
      }
    }
    return alert;
  }

  private async escalate(alert: RansomwareAlert): Promise<void> {
    await forward({
      ts: alert.ts,
      kind: 'ransomware.detected',
      severity: 'critical',
      attrs: {
        score: alert.score,
        reasons: alert.reasons,
        samplePaths: alert.samplePaths,
        agentId: alert.agentId,
      },
    });
  }
}

export const ransomwareDetector = new RansomwareDetector();
