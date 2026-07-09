/**
 * secret-rotator — Sentinel-owned autonomous secret rotation engine.
 *
 * Rotates registered secrets on a per-secret cadence, maintains a versioned
 * ledger (in `systemMeta`) so consumers can roll forward without downtime, and
 * self-heals: if the scheduler missed a rotation (process crash, backpressure),
 * the next tick rotates anything past its grace period. Every rotation is
 * hash-chained through the audit log; failures escalate to the SIEM.
 *
 * The rotation action (how a new value is minted and applied) is injected, so
 * the engine is pure/testable. Production wiring supplies a real action that
 * pushes the new value to the secure store (or Vault).
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { systemMeta } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { appendAudit } from '../lib/audit.js';
import { log } from '../lib/logging.js';
import { forward } from './siem-forwarder.js';

const NS = 'secret-rotator:';

export interface SecretRegistration {
  id: string;
  name: string;
  intervalMs: number;
  graceMs?: number;
  /** Store the current value in systemMeta under this key (optional). */
  storeKey?: string;
  meta?: Record<string, unknown>;
}

export interface RotationRecord {
  id: string;
  secretId: string;
  version: number;
  rotatedAt: string;
  actor: string;
  status: 'success' | 'failed';
  nextDue: string;
  error?: string;
}

export type RotationAction = (
  reg: SecretRegistration,
  previous: string | null
) => Promise<string> | string;

const DEFAULT_GRACE_MS = 6 * 60 * 60 * 1000;

export class SecretRotator {
  private registrations = new Map<string, SecretRegistration>();
  private ledger = new Map<string, RotationRecord>();
  private timer: NodeJS.Timeout | null = null;
  private action: RotationAction;
  private tickMs: number;

  constructor(action?: RotationAction, tickMs = 60_000) {
    this.action = action ?? defaultMint;
    this.tickMs = tickMs;
  }

  register(reg: SecretRegistration): void {
    this.registrations.set(reg.id, reg);
    void this.loadLedger(reg.id);
    log.info('secret-rotator registered', { id: reg.id, intervalMs: reg.intervalMs });
  }

  unregister(id: string): void {
    this.registrations.delete(id);
  }

  list(): SecretRegistration[] {
    return [...this.registrations.values()];
  }

  getLedger(id: string): RotationRecord | undefined {
    return this.ledger.get(id);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(
      () =>
        void this.tick().catch((e) =>
          log.error('secret-rotator tick failed', { error: String(e) })
        ),
      this.tickMs
    );
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(actor = 'secret-rotator'): Promise<RotationRecord[]> {
    const now = Date.now();
    const done: RotationRecord[] = [];
    for (const reg of this.registrations.values()) {
      const last = this.ledger.get(reg.id);
      const due = last ? new Date(last.nextDue).getTime() : 0;
      const grace = reg.graceMs ?? DEFAULT_GRACE_MS;
      if (last && now < due && now < due + grace) continue;
      done.push(await this.rotateNow(reg.id, actor));
    }
    return done;
  }

  async rotateNow(id: string, actor = 'secret-rotator'): Promise<RotationRecord> {
    const reg = this.registrations.get(id);
    if (!reg) throw new Error(`Unknown secret registration: ${id}`);
    const last = this.ledger.get(id);
    const storeKey = reg.storeKey ? `${NS}value:${reg.storeKey}` : null;
    const previous = storeKey ? await this.readValue(storeKey) : null;
    const version = (last?.version ?? 0) + 1;
    const startedAt = new Date();
    try {
      const value = await this.action(reg, previous);
      if (storeKey) await this.writeValue(storeKey, value);
      const record: RotationRecord = {
        id: randomUUID(),
        secretId: id,
        version,
        rotatedAt: startedAt.toISOString(),
        actor,
        status: 'success',
        nextDue: new Date(startedAt.getTime() + reg.intervalMs).toISOString(),
      };
      this.ledger.set(id, record);
      await this.persistLedger(id, record);
      await appendAudit('secret.rotate', { secretId: id, version, storeKey }, actor);
      return record;
    } catch (e) {
      const record: RotationRecord = {
        id: randomUUID(),
        secretId: id,
        version,
        rotatedAt: startedAt.toISOString(),
        actor,
        status: 'failed',
        nextDue: new Date(
          startedAt.getTime() + Math.min(reg.intervalMs, 15 * 60 * 1000)
        ).toISOString(),
        error: String(e),
      };
      this.ledger.set(id, record);
      await this.persistLedger(id, record);
      await appendAudit('secret.rotate.failed', { secretId: id, error: String(e) }, actor);
      void forward({
        ts: startedAt.getTime(),
        kind: 'secret.rotation_failed',
        severity: 'error',
        attrs: { secretId: id, error: String(e) },
      }).catch(() => undefined);
      return record;
    }
  }

  private async readValue(key: string): Promise<string | null> {
    const row = await db.query.systemMeta.findFirst({ where: eq(systemMeta.key, key) });
    return row?.value ?? null;
  }

  private async writeValue(key: string, value: string): Promise<void> {
    const existing = await db.query.systemMeta.findFirst({ where: eq(systemMeta.key, key) });
    if (existing)
      await db
        .update(systemMeta)
        .set({ value, updatedAt: new Date() })
        .where(eq(systemMeta.key, key));
    else await db.insert(systemMeta).values({ key, value, updatedAt: new Date() });
  }

  private async persistLedger(id: string, rec: RotationRecord): Promise<void> {
    const key = `${NS}ledger:${id}`;
    const value = JSON.stringify(rec);
    const existing = await db.query.systemMeta.findFirst({ where: eq(systemMeta.key, key) });
    if (existing)
      await db
        .update(systemMeta)
        .set({ value, updatedAt: new Date() })
        .where(eq(systemMeta.key, key));
    else await db.insert(systemMeta).values({ key, value, updatedAt: new Date() });
  }

  private async loadLedger(id: string): Promise<void> {
    try {
      const row = await db.query.systemMeta.findFirst({
        where: eq(systemMeta.key, `${NS}ledger:${id}`),
      });
      if (row?.value) this.ledger.set(id, JSON.parse(row.value) as RotationRecord);
    } catch {
      /* self-heal: ignore corrupt ledger entries */
    }
  }
}

function defaultMint(_reg: SecretRegistration): string {
  return randomBytes(32).toString('base64url');
}

export const secretRotator = new SecretRotator();
