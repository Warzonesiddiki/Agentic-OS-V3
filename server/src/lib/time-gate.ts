/** Time-window guard for privileged escalation. */
import { ApiError } from './errors.js';
import { getEnv } from './env.js';

export interface TimeGateConfig {
  startHour: number;
  endHour: number;
  allowedDays: Array<number | string>;
  timezoneOffsetMinutes?: number;
}

export function loadTimeGateConfig(): TimeGateConfig {
  const env = getEnv();
  return {
    startHour: env.TIME_GATE_START_HOUR,
    endHour: env.TIME_GATE_END_HOUR,
    allowedDays: env.TIME_GATE_ALLOWED_DAYS.split(',').map((day) => day.trim()).filter(Boolean),
  };
}

function normalizeDate(value: Date | number | undefined): Date {
  if (value === undefined) return new Date();
  return value instanceof Date ? value : new Date(value);
}

function evaluateWindow(now: Date, cfg: TimeGateConfig): boolean {
  const local = new Date(now.getTime() + (cfg.timezoneOffsetMinutes ?? 0) * 60_000);
  const hour = local.getHours();
  const day = local.getDay();
  const allowedDays = cfg.allowedDays.map(Number).filter(Number.isInteger);
  if (allowedDays.length > 0 && !allowedDays.includes(day)) return false;
  if (cfg.startHour <= cfg.endHour) return hour >= cfg.startHour && hour < cfg.endHour;
  return hour >= cfg.startHour || hour < cfg.endHour;
}

export function isWithinWindow(now?: Date | number, cfg?: TimeGateConfig): boolean;
export function isWithinWindow(cfg: TimeGateConfig, now?: Date | number): boolean;
export function isWithinWindow(
  first: Date | number | TimeGateConfig = new Date(),
  second?: Date | number | TimeGateConfig,
): boolean {
  if (typeof first === 'object' && !(first instanceof Date) && 'startHour' in first) {
    return evaluateWindow(normalizeDate(second as Date | number | undefined), first);
  }
  return evaluateWindow(normalizeDate(first), (second as TimeGateConfig | undefined) ?? loadTimeGateConfig());
}

export function gateEscalation(scopes: string[], now?: Date | number, cfg?: TimeGateConfig): void;
export function gateEscalation(cfg: TimeGateConfig, scopes: string[], now?: Date | number): void;
export function gateEscalation(
  first: string[] | TimeGateConfig,
  second?: string[] | Date | number,
  third?: Date | number | TimeGateConfig,
): void {
  const legacy = !Array.isArray(first);
  const cfg = legacy ? first : (third as TimeGateConfig | undefined) ?? loadTimeGateConfig();
  const scopes = legacy ? (second as string[]) : first;
  const now = legacy ? (third as Date | number | undefined) : (second as Date | number | undefined);
  if (scopes.includes('admin:emergency')) return;
  if (!isWithinWindow(now, cfg)) {
    throw new ApiError(
      'TIME_GATE_DENIED',
      `Privileged escalation only allowed ${cfg.startHour}:00–${cfg.endHour}:00 (out-of-hours requires admin:emergency).`,
    );
  }
}
