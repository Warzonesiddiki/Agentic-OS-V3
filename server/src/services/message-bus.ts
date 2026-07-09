/**
 * services/message-bus.ts — IPC Message Bus.
 *
 * Full-featured topic-based message bus inspired by AutoGen Core:
 *   - Topics: agent:<id>, team:<id>, system:<event>
 *   - Patterns: publish/subscribe, request/response (RPC), fire-and-forget
 *   - Hierarchical topic matching with wildcards (*, **)
 *   - Message routing with delivery guarantees and acknowledgments
 *   - Dead-letter queue for undelivered messages
 *   - Event emitter pattern for integration with existing components
 *
 * Integrates with the client-side OS kernel via shared types and
 * exposes a Node.js EventEmitter for service-to-service communication.
 */
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { log } from "../lib/logging.js";

// ── Types ─────────────────────────────────────────────────────

export type MessageKind = "event" | "command" | "query" | "response";

export interface BusMessage {
  id: string;
  type: string;
  kind: MessageKind;
  from: string;
  to?: string;
  topic: string;
  payload: unknown;
  correlationId?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  ttl?: number;
  priority: number;
  acked: boolean;
  deliveries: number;
  error?: string;
  createdAt: number;
}

export interface BusSubscription {
  id: string;
  subscriberId: string;
  topicPattern: string;
  /** Pre-split pattern segments cached at subscribe time to avoid re-splitting on every publish (hot path). */
  segments: string[];
  queue?: string;
  createdAt: number;
}

export interface DeadLetterEntry {
  message: BusMessage;
  reason: string;
  failedDeliveries: number;
  lastError: string;
  movedAt: number;
}

export interface RpcRequest {
  method: string;
  params: unknown;
  timeoutMs: number;
}

export interface RpcResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface BusStats {
  messagesPublished: number;
  messagesDelivered: number;
  messagesDeadLettered: number;
  subscriptionsActive: number;
  rpcPending: number;
  queueDepth: number;
}

export interface MessageFilter {
  kinds?: MessageKind[];
  types?: string[];
  from?: string;
  to?: string;
  minPriority?: number;
}

// ── Topic Matching ────────────────────────────────────────────

function topicMatchSegments(patternSegments: string[], topicSegments: string[]): boolean {
  const p = patternSegments;
  const t = topicSegments;
  let pi = 0;
  for (let ti = 0; ti < t.length; ti++) {
    if (pi >= p.length) return false;
    if (p[pi] === "**") return true;
    if (p[pi] === "*" || p[pi] === t[ti]) {
      pi++;
      continue;
    }
    return false;
  }
  return pi === p.length;
}

function topicMatch(pattern: string, topic: string): boolean {
  return topicMatchSegments(pattern.split("/"), topic.split("/"));
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

// ── Message Bus ───────────────────────────────────────────────

/**
 * Topic-based IPC message bus for inter-service communication.
 * Supports publish/subscribe, request/response (RPC), and fire-and-forget
 * patterns with hierarchical topic matching, delivery tracking, and a dead-letter queue.
 */
export class MessageBus extends EventEmitter {
  private subscriptions: Map<string, BusSubscription> = new Map();
  private subscriptionHandlers: Map<string, Set<(msg: BusMessage) => void>> = new Map();
  private messages: BusMessage[] = [];
  private deadLetter: DeadLetterEntry[] = [];
  private rpcPending: Map<string, { resolve: (res: RpcResponse) => void; timer: ReturnType<typeof setTimeout> }> = new Map();
  private stats: BusStats = {
    messagesPublished: 0,
    messagesDelivered: 0,
    messagesDeadLettered: 0,
    subscriptionsActive: 0,
    rpcPending: 0,
    queueDepth: 0,
  };
  private maxMessages: number;
  private maxDeadLetter: number;

  constructor(maxMessages = 5000, maxDeadLetter = 1000) {
    super();
    this.setMaxListeners(100);
    this.maxMessages = maxMessages;
    this.maxDeadLetter = maxDeadLetter;
  }

  // ── Publish ─────────────────────────────────────────────────

  /**
   * Publish a message to the bus on a given topic.
   * Routes to matching subscriptions and emits EventEmitter events for loose coupling.
   */
  publish(
    type: string,
    from: string,
    to: string | undefined,
    payload: unknown,
    kind: MessageKind = "event",
    topic?: string,
    extras?: Partial<Pick<BusMessage, "correlationId" | "replyTo" | "headers" | "ttl" | "priority">>
  ): BusMessage {
    const topicStr = topic ?? defaultTopic(type, kind);
    const msg: BusMessage = {
      id: createId("msg"),
      type,
      kind,
      from,
      to,
      topic: topicStr,
      payload,
      correlationId: extras?.correlationId,
      replyTo: extras?.replyTo,
      headers: extras?.headers,
      ttl: extras?.ttl,
      priority: extras?.priority ?? 50,
      acked: false,
      deliveries: 0,
      createdAt: Date.now(),
    };

    this.messages.unshift(msg);
    this.trimMessages();
    this.stats.messagesPublished++;

    this.emit("message", msg);

    const handlers = this.subscriptionHandlers.get("__all__");
    if (handlers) {
      for (const fn of handlers) {
        try { fn(msg); } catch { /* handler error */ }
      }
    }

    const topicSegments = topicStr.split("/");
    for (const sub of this.subscriptions.values()) {
      if (!topicMatchSegments(sub.segments, topicSegments)) continue;
      const subHandlers = this.subscriptionHandlers.get(sub.id);
        if (subHandlers) {
          for (const fn of subHandlers) {
            try {
              fn(msg);
              this.stats.messagesDelivered++;
              msg.deliveries++;
            } catch (e) {
              this.handleDeliveryError(msg, sub, e);
            }
          }
        }
      }
    }

    this.stats.queueDepth = this.messages.length;

    const ttl = msg.ttl;
    if (ttl && ttl > 0) {
      setTimeout(() => {
        if (!msg.acked) {
          this.moveToDeadLetter(msg.id, `TTL expired after ${ttl}ms`);
        }
      }, ttl).unref();
    }

    this.emit(kind, msg);
    this.emit(`topic:${topicStr}`, msg);
    if (to) this.emit(`to:${to}`, msg);

    return msg;
  }

  // ── Subscribe ───────────────────────────────────────────────

  /**
   * Subscribe to messages matching a topic pattern (supports * and ** wildcards).
   * Returns a BusSubscription; duplicate subscriberId+topicPattern pairs are idempotent.
   */
  subscribe(
    subscriberId: string,
    topicPattern: string,
    handler: (msg: BusMessage) => void
  ): BusSubscription {
    const existing = Array.from(this.subscriptions.values())
      .find((s) => s.subscriberId === subscriberId && s.topicPattern === topicPattern);
    if (existing) return existing;

    const sub: BusSubscription = {
      id: createId("sub"),
      subscriberId,
      topicPattern,
      segments: topicPattern.split("/"),
      createdAt: Date.now(),
    };

    this.subscriptions.set(sub.id, sub);
    const handlers = this.subscriptionHandlers.get(sub.id) ?? new Set();
    handlers.add(handler);
    this.subscriptionHandlers.set(sub.id, handlers);
    this.stats.subscriptionsActive = this.subscriptions.size;

    this.emit("subscribed", sub);

    return sub;
  }

  subscribeAll(handler: (msg: BusMessage) => void): () => void {
    const handlers = this.subscriptionHandlers.get("__all__") ?? new Set();
    handlers.add(handler);
    this.subscriptionHandlers.set("__all__", handlers);
    return () => { handlers.delete(handler); };
  }

  unsubscribe(subscriptionId: string): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return false;
    this.subscriptions.delete(subscriptionId);
    this.subscriptionHandlers.delete(subscriptionId);
    this.stats.subscriptionsActive = this.subscriptions.size;
    this.emit("unsubscribed", sub);
    return true;
  }

  unsubscribeAll(subscriberId: string): number {
    let count = 0;
    for (const [id, sub] of this.subscriptions) {
      if (sub.subscriberId === subscriberId) {
        this.subscriptions.delete(id);
        this.subscriptionHandlers.delete(id);
        count++;
      }
    }
    this.stats.subscriptionsActive = this.subscriptions.size;
    if (count > 0) this.emit("unsubscribed_all", { subscriberId, count });
    return count;
  }

  // ── Request / Response (RPC) ────────────────────────────────

  /**
   * Send an RPC request on a topic and await a response.
   * Automatically handles timeout and correlation via reply-to routing.
   */
  async request(
    topic: string,
    from: string,
    rpcReq: RpcRequest,
    timeoutMs: number = 30000
  ): Promise<RpcResponse> {
    const correlationId = createId("rpc");

    return new Promise((resolve) => {
      const handler = (msg: BusMessage) => {
        if (msg.correlationId === correlationId && msg.kind === "response") {
          cleanup();
          resolve({
            success: !msg.error,
            data: msg.payload,
            error: msg.error,
          });
        }
      };

      const unsub = this.subscribeAll(handler);

      const timer = setTimeout(() => {
        cleanup();
        resolve({
          success: false,
          error: `RPC timeout: ${rpcReq.method} on ${topic} after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      const cleanup = () => {
        unsub();
        clearTimeout(timer);
        this.rpcPending.delete(correlationId);
        this.stats.rpcPending = this.rpcPending.size;
      };

      this.rpcPending.set(correlationId, { resolve, timer });
      this.stats.rpcPending = this.rpcPending.size;

      this.publish(
        rpcReq.method,
        from,
        undefined,
        rpcReq.params,
        "command",
        topic,
        { correlationId, ttl: timeoutMs, priority: 80 }
      );
    });
  }

  /**
   * Respond to an RPC request identified by correlationId.
   * Publishes a response message routed back to the original requester.
   */
  respond(
    correlationId: string,
    from: string,
    to: string,
    data: unknown,
    error?: string
  ): BusMessage {
    return this.publish(
      "rpc.response",
      from,
      to,
      error ? undefined : data,
      "response",
      `rpc:${correlationId}`,
      { correlationId, headers: error ? { error } : undefined }
    );
  }

  // ── Fire-and-Forget (Events) ────────────────────────────────

  fireEvent(
    type: string,
    from: string,
    topic: string,
    payload: unknown,
    ttlMs?: number
  ): BusMessage {
    return this.publish(type, from, undefined, payload, "event", topic, { ttl: ttlMs, priority: 30 });
  }

  sendCommand(
    type: string,
    from: string,
    to: string,
    topic: string,
    payload: unknown
  ): BusMessage {
    return this.publish(type, from, to, payload, "command", topic, { priority: 70 });
  }

  sendQuery(
    type: string,
    from: string,
    to: string,
    topic: string,
    payload: unknown
  ): BusMessage {
    return this.publish(type, from, to, payload, "query", topic, { priority: 60 });
  }

  // ── Acknowledgment ──────────────────────────────────────────

  ack(messageId: string): boolean {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg) return false;
    msg.acked = true;
    this.emit("acked", msg);
    return true;
  }

  nack(messageId: string): boolean {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg) return false;
    msg.deliveries++;
    this.emit("nacked", msg);
    if (msg.deliveries >= 3) {
      this.moveToDeadLetter(messageId, `Exceeded max deliveries (${msg.deliveries})`);
    }
    return true;
  }

  // ── Dead-Letter Queue ───────────────────────────────────────

  moveToDeadLetter(messageId: string, reason: string): DeadLetterEntry | null {
    const idx = this.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return null;
    const msg = this.messages.splice(idx, 1)[0];
    if (!msg) return null;
    const entry: DeadLetterEntry = {
      message: msg,
      reason,
      failedDeliveries: msg.deliveries,
      lastError: reason,
      movedAt: Date.now(),
    };
    this.deadLetter.unshift(entry);
    this.trimDeadLetter();
    this.stats.messagesDeadLettered++;
    this.emit("dead_letter", entry);
    return entry;
  }

  retryDeadLetter(index: number): BusMessage | null {
    const entry = this.deadLetter[index];
    if (!entry) return null;
    const restored: BusMessage = { ...entry.message, deliveries: 0, acked: false, error: undefined };
    this.deadLetter.splice(index, 1);
    this.messages.unshift(restored);
    this.emit("retried", restored);
    return restored;
  }

  replayDeadLetter(filter?: (entry: DeadLetterEntry) => boolean): number {
    const toReplay = filter
      ? this.deadLetter.filter(filter)
      : [...this.deadLetter];
    let count = 0;
    for (const entry of toReplay) {
      const idx = this.deadLetter.indexOf(entry);
      if (idx >= 0 && this.retryDeadLetter(idx)) count++;
    }
    this.emit("replayed", { count });
    return count;
  }

  purgeDeadLetter(): number {
    const count = this.deadLetter.length;
    this.deadLetter = [];
    this.emit("dead_letter_purged", { count });
    return count;
  }

  // ── Queries ─────────────────────────────────────────────────

  getSubscriptions(): BusSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  getSubscriptionsFor(subscriberId: string): BusSubscription[] {
    return Array.from(this.subscriptions.values())
      .filter((s) => s.subscriberId === subscriberId);
  }

  getDeadLetter(): DeadLetterEntry[] {
    return [...this.deadLetter];
  }

  getMessages(filter?: MessageFilter): BusMessage[] {
    let result = this.messages;
    if (filter) {
      if (filter.kinds) result = result.filter((m) => filter.kinds!.includes(m.kind));
      if (filter.types) result = result.filter((m) => filter.types!.includes(m.type));
      if (filter.from) result = result.filter((m) => m.from === filter.from);
      if (filter.to) result = result.filter((m) => m.to === filter.to);
      if (filter.minPriority !== undefined) result = result.filter((m) => m.priority >= filter.minPriority!);
    }
    return result;
  }

  getMessage(id: string): BusMessage | undefined {
    return this.messages.find((m) => m.id === id);
  }

  getStats(): BusStats {
    return { ...this.stats, rpcPending: this.rpcPending.size };
  }

  hasPendingRpc(): boolean {
    return this.rpcPending.size > 0;
  }

  cancelPendingRpcs(reason?: string): number {
    let count = 0;
    for (const [id, pending] of this.rpcPending) {
      clearTimeout(pending.timer);
      pending.resolve({ success: false, error: reason ?? "RPC cancelled" });
      this.rpcPending.delete(id);
      count++;
    }
    this.stats.rpcPending = this.rpcPending.size;
    return count;
  }

  // ── Lifecycle ───────────────────────────────────────────────

  clear(): void {
    this.subscriptions.clear();
    this.subscriptionHandlers.clear();
    this.messages = [];
    this.deadLetter = [];
    this.cancelPendingRpcs("Bus cleared");
    this.stats = {
      messagesPublished: 0,
      messagesDelivered: 0,
      messagesDeadLettered: 0,
      subscriptionsActive: 0,
      rpcPending: 0,
      queueDepth: 0,
    };
    this.removeAllListeners();
    this.emit("cleared");
  }

  // ── Internal ────────────────────────────────────────────────

  private handleDeliveryError(msg: BusMessage, sub: BusSubscription, error: unknown): void {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.warn("message_bus_delivery_error", {
      messageId: msg.id,
      subscriptionId: sub.id,
      subscriberId: sub.subscriberId,
      error: errMsg,
    });
    msg.deliveries++;
    if (msg.deliveries >= 3) {
      this.moveToDeadLetter(msg.id, `Delivery failed after ${msg.deliveries} attempts: ${errMsg}`);
    }
  }

  private trimMessages(): void {
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(0, this.maxMessages);
    }
  }

  private trimDeadLetter(): void {
    if (this.deadLetter.length > this.maxDeadLetter) {
      this.deadLetter = this.deadLetter.slice(0, this.maxDeadLetter);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────

function defaultTopic(type: string, kind: MessageKind): string {
  const prefix =
    kind === "event" ? "system" :
    kind === "command" ? "agent" :
    kind === "query" ? "agent" :
    "system";
  return `${prefix}:${type}`;
}

// ── Singleton ─────────────────────────────────────────────────

let _instance: MessageBus | null = null;

/**
 * Get the singleton MessageBus instance, creating it lazily if needed.
 */
export function getMessageBus(): MessageBus {
  if (!_instance) {
    _instance = new MessageBus();
    log.info("message_bus_initialized", { instance: "singleton" });
  }
  return _instance;
}

export function resetMessageBus(): void {
  if (_instance) {
    _instance.clear();
    _instance = null;
    log.info("message_bus_reset", {});
  }
}
