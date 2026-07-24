import { getMessageBus } from './message-bus.js';
import { publishKernelEvent } from './kernel.js';
import { log } from '../lib/logging.js';
import { KERNEL_EVENTS } from './kernel.js';

/**
 * Phase 11 — Task 11.24: Panic Handler + Crash Dump.
 *
 * When a fatal, non-recoverable fault occurs the kernel enters emergency mode.
 * `enterPanic` records the dump, fires registered handlers, publishes a
 * `kernel.panic` bus event and a typed kernel event, and (outside of test) the
 * registered shutdown hook is invoked. `recoverFromPanic` clears emergency mode.
 */

export interface PanicInfo {
  reason: string;
  extra?: Record<string, unknown>;
  at: number;
}

type PanicHandler = (info: PanicInfo) => void | Promise<void>;

const PANIC_TOPIC = KERNEL_EVENTS.PANIC;
const handlers = new Set<PanicHandler>();
let emergency = false;
let lastInfo: PanicInfo | undefined;

/**
 * Enter emergency mode. Synchronous setter so callers can assert `isPanic()`
 * immediately; handler invocation and event publishing happen after the state
 * flip (best-effort, never blocks the caller). Idempotent — repeated panics are
 * coalesced.
 */
export function enterPanic(reason: string, extra?: Record<string, unknown>): void {
  // A repeated panic must not re-run shutdown handlers or publish a second
  // terminal event; callers can inspect the first durable panic dump instead.
  if (emergency) return;
  const at = Date.now();
  lastInfo = { reason, extra, at };
  emergency = true; // flipped synchronously
  log.error('kernel_panic', { reason, extra });

  for (const h of handlers) {
    try {
      const r = h(lastInfo);
      if (r instanceof Promise) r.catch(() => undefined);
    } catch (e) {
      log.error('panic_handler_error', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  try {
    publishKernelEvent('kernel.panic', { reason, extra: extra ?? {} });
  } catch (e) {
    log.error('panic_publish_error', { error: e instanceof Error ? e.message : String(e) });
  }
  try {
    getMessageBus().publish(PANIC_TOPIC, 'kernel', undefined, {
      reason,
      extra: extra ?? {},
    } as unknown);
  } catch (e) {
    log.error('panic_bus_publish_error', { error: e instanceof Error ? e.message : String(e) });
  }
}

export function isPanic(): boolean {
  return emergency;
}

/** Alias for `isPanic()` — returns true while the kernel is in emergency mode. */
export function isEmergencyMode(): boolean {
  return emergency;
}

export function recoverFromPanic(): void {
  emergency = false;
  log.info('kernel_panic_cleared', {});
}

export function getPanicInfo(): PanicInfo | undefined {
  return lastInfo;
}

export function registerPanicHandler(fn: PanicHandler): void {
  handlers.add(fn);
}

/** Alias retained for backward compatibility. */
export const kernelPanic = enterPanic;
export const clearEmergencyMode = recoverFromPanic;
export const getLastPanicDump = getPanicInfo;

/** Test helper — clears all handler state. */
export function __resetPanicState(): void {
  handlers.clear();
  emergency = false;
  lastInfo = undefined;
}
