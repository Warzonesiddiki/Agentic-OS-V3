/**
 * logger.ts — shared frontend logging utility.
 *
 * Replaces ad-hoc `console.warn` / `console.error` calls with eslint-disable
 * throughout the frontend. All output goes through here so it can be:
 *  - Centrally controlled (respects `logLevel` from config)
 *  - Easily silenced in tests
 *  - Traced to a module origin
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

let _level: LogLevel = "warn";

/** Update the effective log level (call from config subscription). */
export function setLogLevel(level: LogLevel): void {
  _level = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[_level];
}

function prefix(tag: string): string {
  return `[NEXUS:${tag}]`;
}

export const logger = {
  debug(tag: string, ...args: unknown[]): void {
    if (shouldLog("debug")) console.debug(prefix(tag), ...args);
  },
  info(tag: string, ...args: unknown[]): void {
    if (shouldLog("info")) console.info(prefix(tag), ...args);
  },
  warn(tag: string, ...args: unknown[]): void {
    if (shouldLog("warn")) console.warn(prefix(tag), ...args);
  },
  error(tag: string, ...args: unknown[]): void {
    if (shouldLog("error")) console.error(prefix(tag), ...args);
  },
};
