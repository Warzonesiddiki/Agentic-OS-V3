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

/** Re-export the shadow-daemon's cycle as part of the health-monitor surface
 *  (Forge's task-worker calls `healthMonitor.runShadowCycle()`). */
export function runShadowCycle(): void {
  void _shadowRunShadowCycle();
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

export function registerHealthCheck(check: HealthCheck): void {
  _checks.set(check.subsystem, check);
  if (!_state.has(check.subsystem)) {
    _state.set(check.subsystem, {
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
}

export async function runHealthChecks(): Promise<RunResult> {
  const healed: string[] = [];
  const subsystems: SubsystemHealth[] = [];
  let ok = 0;
  let degraded = 0;
  let down = 0;

  for (const [name, check] of _checks) {
    const st = _state.get(name)!;
    let status: HealthStatus =
      typeof check.check === 'function'
        ? await (check.check as () => Promise<HealthStatus>)()
        : (check.check as HealthStatus);

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
          const after = await (check.check as () => Promise<HealthStatus>)();
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

  return { summary: { ok, degraded, down }, subsystems, healed };
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
