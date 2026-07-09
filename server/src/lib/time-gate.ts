/**
 * time-gate.ts — time-based ring escalation control.
 *
 * Ring promotion / privileged escalation is only permitted during the configured
 * window. Outside the window a request carrying `admin:emergency` scope is still
 * allowed; everything else is denied with TIME_GATE_DENIED.
 */
import { ApiError } from './errors.js';
import { getEnv } from './env.js';

export interface TimeGateConfig {
  // Inclusive window in 24h local time, e.g. 09:00–17:00.
  startHour: number; // 0-23
  endHour: number; // 0-23
  // Optional per-day-of-week allowlist (0=Sun..6=Sat). Empty = all days.
  allowedDays: number[];
  timezoneOffsetMinutes?: number;
}

export function loadTimeGateConfig(): TimeGateConfig {
  const env = getEnv();
  const startHour = Number(env.TIME_GATE_START_HOUR ?? 9);
  const endHour = Number(env.TIME_GATE_END_HOUR ?? 17);
  const allowedDays = ((env.TIME_GATE_ALLOWED_DAYS as string | undefined) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  return { startHour, endHour, allowedDays };
}

export function isWithinWindow(
  now: Date = new Date(),
  cfg: TimeGateConfig = loadTimeGateConfig()
): boolean {
  const mins = cfg.timezoneOffsetMinutes ?? 0;
  const local = new Date(now.getTime() + mins * 60_000);
  const hour = local.getHours();
  const day = local.getDay();
  if (cfg.allowedDays.length && !cfg.allowedDays.includes(day)) return false;
  if (cfg.startHour <= cfg.endHour) {
    return hour >= cfg.startHour && hour < cfg.endHour;
  }
  // Window wraps midnight.
  return hour >= cfg.startHour || hour < cfg.endHour;
}

/**
 * Gate a privileged escalation. `scopes` is the caller's scope set; if it contains
 * `admin:emergency`, the gate is bypassed even outside the window.
 */
export function gateEscalation(
  scopes: string[],
  now: Date = new Date(),
  cfg: TimeGateConfig = loadTimeGateConfig()
): void {
  if (scopes.includes('admin:emergency')) return;
  if (!isWithinWindow(now, cfg)) {
    throw new ApiError(
      'TIME_GATE_DENIED',
      `Privileged escalation only allowed ${cfg.startHour}:00–${cfg.endHour}:00 (out-of-hours requires admin:emergency).`
    );
  }
}
