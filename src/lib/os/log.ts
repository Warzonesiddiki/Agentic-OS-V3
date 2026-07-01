/**
 * Lightweight logger for browser/CLI environments.
 * Silences debug/info in production; always shows errors.
 */
const isDev = typeof import.meta !== "undefined" && (import.meta as { env?: { MODE?: string } }).env?.MODE !== "production";

function noop(..._args: unknown[]): void {}

/** Production-safe logger. `debug` and `info` are silent in prod. */
export const logger = {
  debug: isDev ? (...args: unknown[]) => console.log("[debug]", ...args) : noop,
  info: isDev ? (...args: unknown[]) => console.log("[info]", ...args) : noop,
  warn: (...args: unknown[]) => console.warn("[warn]", ...args),
  error: (...args: unknown[]) => console.error("[error]", ...args),
};
