/**
 * kernel-events.ts — Phase 11 kernel event bus surface.
 *
 * Compatibility facade over the typed kernel event bus in kernel.ts.
 */
import {
  KERNEL_EVENTS,
  getKernelEventHistory,
  publishKernelEvent,
  subscribeKernelEvent,
  type KernelEventType,
} from './kernel.js';
import { getMessageBus, type MessageBus } from './message-bus.js';

export { KERNEL_EVENTS };
export type { MessageBus };

export type KernelEventPayload = Record<string, unknown>;

export function getEventBus(): MessageBus {
  return getMessageBus();
}

function toPayload(payload: unknown): KernelEventPayload {
  return payload !== null && typeof payload === 'object'
    ? (payload as KernelEventPayload)
    : { value: payload };
}

export function publish(type: string, payload: KernelEventPayload): void {
  publishKernelEvent(type as KernelEventType, payload);
}

export function subscribe(type: string, handler: (payload: KernelEventPayload) => void): () => void {
  return subscribeKernelEvent(type as KernelEventType, handler);
}

export function getEventHistory(): Array<{
  type: string;
  at: number;
  payload: KernelEventPayload;
}> {
  return getKernelEventHistory();
}

export function publishEvent(topic: string, payload: unknown): void {
  publish(topic, toPayload(payload));
}

export function onEvent(topic: string, handler: (payload: unknown) => void): () => void {
  return subscribe(topic, handler);
}
