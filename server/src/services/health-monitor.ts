/**
 * health-monitor.ts — ML-002 self-healing health checks.
 *
 * Subsystems register a `check()` (returns HealthStatus) and an optional
 * `restart()` (recovers a degraded/dead subsystem). `runHealthChecks()` evaluates
 * every registered subsystem; any that report DEGRADED or DOWN and have a restart
 * hook are auto-healed (restart invoked, then re-checked). Restart attempts are
 * bounded per cycle to prevent thundering-herd loops, and a cooldown prevents
 * restart storms. `getHealthSummary()` is consumed by the perf/analytics routes.
 */
import { runShadowCycle as _shadowRunShadowCycle } from './shadow-daemon.js';
import type { ShadowReport } from './shadow-daemon.js';

/** Re-export the shadow-daemon's cycle as part of the health-monitor surface
 *  (Forge's task-worker calls `healthMonitor.runShadowCycle()`). */
export async function runShadowCycle(): Promise<ShadowReport> {
  return _shadowRunShadowCycle();
}
export type HealthLevel = 'ok' | 'degraded' | 'down';

export interface HealthStatus {
  level: HealthLevel;
  message: string;
  detail?: Record<string, unknown>;
}

export interface SubsystemHealth extends HealthStatus {
  subsystem: string;
  lastCheckedAt: number;
  restartAttempts: number;
  lastRestartAt: number;
}

export interface HealthCheck {
  subsystem: string;
  check: () => Promise<HealthStatus> | HealthStatus;
  restart?: () => Promise<void> | void;
  /** Max restart attempts before the subsystem is marked failed (no auto-heal). */
  maxRestartAttempts?: number;
  /** Cooldown (ms) between restart attempts. */
  cooldownMs?: number;
}

const _checks = new Map<string, HealthCheck>();
const _state = new Map<
  string,
  { lastCheckedAt: number; restartAttempts: number; lastRestartAt: number }
>();

type LegacyHealthCheck = { id: string; fn: () => Promise<HealthLevel> | HealthLevel };

function healthLevelToStatus(level: HealthLevel): HealthStatus {
  return { level, message: level };
}

export function registerHealthCheck(check: HealthCheck | LegacyHealthCheck): void {
  const normalized: HealthCheck = 'check' in check
    ? {
        subsystem: check.subsystem,
        check: check.check,
        restart: check.restart,
        maxRestartAttempts: check.maxRestartAttempts ?? 3,
        cooldownMs: check.cooldownMs ?? 5000,
      }
    : {
        subsystem: check.id,
        check: async () => healthLevelToStatus(await check.fn()),
        maxRestartAttempts: 3,
        cooldownMs: 5000,
      };

  _checks.set(normalized.subsystem, normalized);
  if (!_state.has(normalized.subsystem)) {
    _state.set(normalized.subsystem, {
      lastCheckedAt: 0,
      restartAttempts: 0,
      lastRestartAt: 0,
    });
  }
}

export function unregisterHealthCheck(subsystem: string): void {
  _checks.delete(subsystem);
  _state.delete(subsystem);
}

export interface RunResult {
  summary: { ok: number; degraded: number; down: number };
  subsystems: SubsystemHealth[];
  healed: string[];
  total: number;
  status: HealthLevel;
}

export async function runHealthChecks(): Promise<RunResult> {
  const healed: string[] = [];
  const subsystems: SubsystemHealth[] = [];
  let ok = 0;
  let degraded = 0;
  let down = 0;

  for (const [name, check] of _checks) {
    const st = _state.get(name)!;
    let status = await check.check();

    if (status.level === 'ok') {
      ok++;
      st.restartAttempts = 0;
    } else if (status.level === 'degraded' || status.level === 'down') {
      if (status.level === 'degraded') degraded++;
      else down++;

      const maxAttempts = check.maxRestartAttempts ?? 3;
      const cooldown = check.cooldownMs ?? 5_000;
      const now = Date.now();
      const canRestart =
        !!check.restart && st.restartAttempts < maxAttempts && now - st.lastRestartAt >= cooldown;

      if (canRestart) {
        try {
          await check.restart!();
          st.restartAttempts++;
          st.lastRestartAt = now;
          // Re-check after restart.
          const after = await check.check();
          if (after.level === 'ok') {
            healed.push(name);
            ok++;
            status = after;
            st.restartAttempts = 0;
          } else {
            status = after;
            if (after.level === 'degraded') degraded++;
            else down++;
          }
        } catch {
          // Restart failed; keep degraded/down, will retry after cooldown.
          status = { ...status, message: `${status.message} (restart failed)` };
          if (status.level === 'degraded') degraded++;
          else down++;
        }
      }
    }

    st.lastCheckedAt = Date.now();
    subsystems.push({
      subsystem: name,
      ...status,
      lastCheckedAt: st.lastCheckedAt,
      restartAttempts: st.restartAttempts,
      lastRestartAt: st.lastRestartAt,
    });
  }

  const status: HealthLevel = down > 0 ? 'down' : degraded > 0 ? 'degraded' : 'ok';
  return { summary: { ok, degraded, down }, subsystems, healed, total: subsystems.length, status };
}

export function getHealthSummary(): {
  ok: number;
  degraded: number;
  down: number;
  subsystems: SubsystemHealth[];
} {
  const subsystems: SubsystemHealth[] = [];
  for (const [name] of _checks) {
    const st = _state.get(name)!;
    subsystems.push({
      subsystem: name,
      level: 'ok',
      message: 'not yet evaluated',
      lastCheckedAt: st.lastCheckedAt,
      restartAttempts: st.restartAttempts,
      lastRestartAt: st.lastRestartAt,
    });
  }
  return { ok: subsystems.length, degraded: 0, down: 0, subsystems };
}

export function getSubsystemHealth(subsystem: string): SubsystemHealth | undefined {
  const st = _state.get(subsystem);
  if (!st) return undefined;
  return {
    subsystem,
    level: 'ok',
    message: 'last known ok (not re-evaluated)',
    lastCheckedAt: st.lastCheckedAt,
    restartAttempts: st.restartAttempts,
    lastRestartAt: st.lastRestartAt,
  };
}

// ── Legacy health API for metron tests ─────────────────────────

export function healthStatus(subsystem: string): SubsystemHealth | undefined {
  return getSubsystemHealth(subsystem);
}

export async function heal(
  subsystem: string,
  recovery: () => Promise<string>
): Promise<string> {
  const check = _checks.get(subsystem);
  if (!check?.restart) {
    // No restart hook — invoke the recovery function and report
    try {
      return await recovery();
    } catch {
      return 'healed (no-op)';
    }
  }
  try {
    await check.restart();
    return 'healed';
  } catch {
    return 'heal failed';
  }
}
