/**
 * kernel-events.ts — Phase 11 kernel event bus surface.
 *
 * Thin re-export of the message-bus event APIs consumed by the phase11-kernel
 * test suite (tests/services/kernel.test.ts and tests/phase11-kernel.test.ts).
 */
import { getMessageBus, type MessageBus } from './message-bus.js';

export function getEventBus(): MessageBus {
  return getMessageBus();
}

export type { MessageBus };

export function publishEvent(topic: string, payload: unknown): void {
  getMessageBus().publish(topic, payload);
}

export function onEvent(topic: string, handler: (payload: unknown) => void): () => void {
  const bus = getMessageBus();
  return bus.subscribe(topic, handler);
}
