/**
 * services/tracing.ts — Trace/Telemetry System for NEXUS Agentic OS.
 *
 * Inspired by the OpenAI SDK tracing model (TraceProvider, Span, BatchProcessor),
 * adapted for the multi-agent kernel. Provides zero-config tracing for all agent
 * operations with automatic context propagation across agents and tools.
 *
 * Span types:
 *   agent_span   — agent lifecycle (spawn, think, execute, finish)
 *   tool_span    — tool call execution
 *   llm_span     — LLM inference call
 *   handoff_span — agent-to-agent handoff / delegation
 *
 * Integration:
 *   - Kernel (syscalls): auto-traced via wrapKernel()
 *   - Store (persistence): traces persisted to the DB via SpanExporter
 *   - Audit system: trace roots are linked to audit entries for compliance
 */

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { db } from "../db/client.js";
import { appendAudit } from "../lib/audit.js";
import { log } from "../lib/logging.js";
import { getRegistry } from "./metrics.js";
import promClient from "prom-client";

// ── Constants ──────────────────────────────────────────────────

const DEFAULT_BATCH_SIZE = 64;
const DEFAULT_EXPORT_INTERVAL_MS = 5000;
const DEFAULT_MAX_QUEUE_SIZE = 2048;

// ── Types ──────────────────────────────────────────────────────

export type SpanType = "agent_span" | "tool_span" | "llm_span" | "handoff_span";
export type SpanStatus = "ok" | "error" | "cancelled";

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface SpanAttributes {
  /** agent_span */
  agentId?: string;
  agentKind?: string;
  agentRing?: number;
  parentAgentId?: string;
  /** tool_span */
  toolName?: string;
  toolTarget?: string;
  toolAuthorized?: boolean;
  toolExitCode?: number;
  /** llm_span */
  model?: string;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** handoff_span */
  fromAgentId?: string;
  toAgentId?: string;
  handoffReason?: string;
  /** performance */
  cpuUsageBefore?: NodeJS.CpuUsage;
  cpuUsageAfter?: NodeJS.CpuUsage;
  memoryUsageBefore?: NodeJS.MemoryUsage;
  memoryUsageAfter?: NodeJS.MemoryUsage;
  /** error */
  error?: string;
  errorCode?: string;
  /** additional */
  [key: string]: unknown;
}

export interface Span {
  readonly id: string;
  readonly traceId: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly type: SpanType;
  status: SpanStatus;
  readonly startTime: number;
  endTime: number | null;
  attributes: SpanAttributes;
  events: SpanEvent[];
  readonly durationMs: number;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  setAttribute(key: string, value: unknown): void;
  setStatus(status: SpanStatus): void;
  end(attributes?: SpanAttributes): void;
  toJSON(): Record<string, unknown>;
}

// ── Span Implementation ────────────────────────────────────────

class SpanImpl implements Span {
  readonly id: string;
  readonly traceId: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly type: SpanType;
  status: SpanStatus;
  readonly startTime: number;
  endTime: number | null;
  attributes: SpanAttributes;
  events: SpanEvent[];

  constructor(
    traceId: string,
    parentId: string | null,
    name: string,
    type: SpanType,
    attributes?: SpanAttributes,
  ) {
    this.id = `spn_${randomUUID()}`;
    this.traceId = traceId;
    this.parentId = parentId;
    this.name = name;
    this.type = type;
    this.status = "ok";
    this.startTime = performance.now();
    this.endTime = null;
    this.attributes = { ...attributes };
    this.events = [];
  }

  addEvent(name: string, attributes?: Record<string, unknown>): void {
    this.events.push({ name, timestamp: performance.now(), attributes });
  }

  setAttribute(key: string, value: unknown): void {
    this.attributes[key] = value;
  }

  setStatus(status: SpanStatus): void {
    this.status = status;
  }

  end(attributes?: SpanAttributes): void {
    if (this.endTime !== null) return;
    this.endTime = performance.now();
    if (attributes) {
      Object.assign(this.attributes, attributes);
    }
  }

  get durationMs(): number {
    return (this.endTime ?? performance.now()) - this.startTime;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      traceId: this.traceId,
      parentId: this.parentId,
      name: this.name,
      type: this.type,
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
      durationMs: this.durationMs,
      attributes: this.attributes,
      events: this.events,
    };
  }
}

// ── Span Exporter ──────────────────────────────────────────────

export interface ExportedSpan {
  id: string;
  traceId: string;
  parentId: string | null;
  name: string;
  type: SpanType;
  status: SpanStatus;
  startTime: number;
  endTime: number | null;
  durationMs: number;
  attributes: SpanAttributes;
  events: SpanEvent[];
}

export interface SpanExporter {
  export(spans: ExportedSpan[]): Promise<void>;
  shutdown(): Promise<void>;
}

export class ConsoleSpanExporter implements SpanExporter {
  async export(spans: ExportedSpan[]): Promise<void> {
    for (const span of spans) {
      log.debug("span_exported", {
        traceId: span.traceId,
        spanId: span.id,
        type: span.type,
        name: span.name,
        durationMs: span.durationMs,
        status: span.status,
      });
    }
  }

  async shutdown(): Promise<void> {
    // no-op
  }
}

export class DatabaseSpanExporter implements SpanExporter {
  private _shutdown = false;

  async export(spans: ExportedSpan[]): Promise<void> {
    if (this._shutdown || spans.length === 0) return;
    try {
      // Persist spans to the DB — one batch insert
      const values = spans.map((s) => ({
        id: s.id,
        traceId: s.traceId,
        parentId: s.parentId,
        name: s.name,
        type: s.type,
        status: s.status,
        startTimeMs: Math.round(s.startTime),
        endTimeMs: s.endTime !== null ? Math.round(s.endTime) : null,
        durationMs: Math.round(s.durationMs),
        attributes: s.attributes,
        events: s.events,
      }));

      // Dynamic import to avoid circular deps at module load
      const { spanLogs } = await import("../db/schema.js");
      await db.insert(spanLogs).values(values as never[]).onConflictDoNothing();
    } catch (e) {
      log.error("span_db_export_failed", { count: spans.length, error: e instanceof Error ? e.message : String(e) });
    }
  }

  async shutdown(): Promise<void> {
    this._shutdown = true;
  }
}

// ── Batch Span Processor ───────────────────────────────────────

export interface SpanProcessor {
  onStart(span: Span): void;
  onEnd(span: Span): void;
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

export class BatchSpanProcessor implements SpanProcessor {
  private readonly _exporter: SpanExporter;
  private readonly _batchSize: number;
  private readonly _exportIntervalMs: number;
  private readonly _maxQueueSize: number;
  private readonly _buffer: Span[] = [];
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _shutdown = false;
  private _flushPromise: Promise<void> | null = null;

  constructor(
    exporter: SpanExporter,
    options?: { batchSize?: number; exportIntervalMs?: number; maxQueueSize?: number },
  ) {
    this._exporter = exporter;
    this._batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
    this._exportIntervalMs = options?.exportIntervalMs ?? DEFAULT_EXPORT_INTERVAL_MS;
    this._maxQueueSize = options?.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
  }

  onStart(_span: Span): void {
    // No-op; we hook onEnd for batching
  }

  onEnd(span: Span): void {
    if (this._shutdown) return;

    this._buffer.push(span);

    // Drop oldest spans if queue exceeds max size (backpressure)
    while (this._buffer.length > this._maxQueueSize) {
      const dropped = this._buffer.shift();
      log.warn("span_dropped_backpressure", { spanId: dropped?.id, traceId: dropped?.traceId });
    }

    // Export immediately if batch size is reached
    if (this._buffer.length >= this._batchSize) {
      this._flush();
    }

    // Lazy-start the periodic timer on first span
    if (!this._timer) {
      this._timer = setInterval(() => { this._flush(); }, this._exportIntervalMs);
      this._timer.unref();
    }
  }

  async forceFlush(): Promise<void> {
    if (this._flushPromise) await this._flushPromise;
    await this._flush();
  }

  async shutdown(): Promise<void> {
    this._shutdown = true;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    await this._flush();
    await this._exporter.shutdown();
  }

  private async _flush(): Promise<void> {
    if (this._flushPromise) return;
    const spans = this._buffer.splice(0, this._batchSize);
    if (spans.length === 0) return;

    this._flushPromise = (async () => {
      try {
        const exported = spans.map((s) => ({
          id: s.id,
          traceId: s.traceId,
          parentId: s.parentId,
          name: s.name,
          type: s.type,
          status: s.status,
          startTime: s.startTime,
          endTime: s.endTime,
          durationMs: s.durationMs,
          attributes: s.attributes,
          events: s.events,
        }));
        await this._exporter.export(exported);

        // Update Prometheus metrics for exported spans
        spanExportedTotal.inc(exported.length);
        for (const sp of exported) {
          spanDurationHistogram.observe(sp.durationMs / 1000);
        }
      } catch (e) {
        log.error("span_batch_export_failed", { error: e instanceof Error ? e.message : String(e) });
        // Re-queue dropped spans
        const _dropped = this._buffer.splice(0, this._buffer.length);
        // Only re-queue if we didn't reach max queue again
        if (this._buffer.length === 0) {
          for (const s of spans) {
            if (this._buffer.length < this._maxQueueSize) {
              this._buffer.push(s);
            }
          }
        }
      } finally {
        this._flushPromise = null;
      }
    })();
  }
}

// ── Noop Span Processor ────────────────────────────────────────

export class NoopSpanProcessor implements SpanProcessor {
  onStart(_span: Span): void {}
  onEnd(_span: Span): void {}
  async forceFlush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}

// ── Trace / TraceProvider ──────────────────────────────────────

export interface Trace {
  readonly id: string;
  readonly spans: Span[];
  addSpan(span: Span): void;
  toJSON(): Record<string, unknown>;
}

class TraceImpl implements Trace {
  readonly id: string;
  readonly spans: Span[] = [];

  constructor(id?: string) {
    this.id = id ?? `trace_${randomUUID()}`;
  }

  addSpan(span: Span): void {
    this.spans.push(span);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      spanCount: this.spans.length,
      spans: this.spans.map((s) => s.toJSON()),
      startTime: this.spans.length > 0 ? Math.min(...this.spans.map((s) => s.startTime)) : null,
      endTime: this.spans.length > 0
        ? Math.max(...this.spans.filter((s) => s.endTime !== null).map((s) => s.endTime!))
        : null,
    };
  }
}

/**
 * Tracer creates and manages spans within a trace hierarchy.
 * Each span captures timing, attributes, and events for a unit of work.
 */
export interface Tracer {
  /**
   * Start a new span as part of a trace. Optionally link to a parent span
   * to build a hierarchical trace tree.
   */
  startSpan(
    name: string,
    type: SpanType,
    options?: { parentId?: string; attributes?: SpanAttributes },
  ): Span;
  endSpan(span: Span, attributes?: SpanAttributes): void;
  getTrace(traceId: string): Trace | undefined;
  getSpans(traceId?: string): Span[];
  getActiveTrace(): Trace | undefined;
}

export interface TraceProvider {
  getTracer(): Tracer;
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

// ── Tracer Implementation ──────────────────────────────────────

class TracerImpl implements Tracer {
  private readonly _traces: Map<string, TraceImpl> = new Map();
  private readonly _processor: SpanProcessor;

  constructor(processor: SpanProcessor) {
    this._processor = processor;
  }

  startSpan(
    name: string,
    type: SpanType,
    options?: { parentId?: string; attributes?: SpanAttributes },
  ): Span {
    // Resolve traceId — use existing parent trace or create new
    let traceId: string;
    const parentId: string | null = options?.parentId ?? null;

    if (parentId) {
      // Find the parent span's trace
      for (const [, trace] of this._traces) {
        const parent = trace.spans.find((s) => s.id === parentId);
        if (parent) {
          traceId = parent.traceId;
          break;
        }
      }
    }

    // If no trace found, create new
    const activeTrace = this.getActiveTrace();
    if (!parentId && activeTrace) {
      traceId = activeTrace.id;
    } else {
      traceId = options?.attributes?.traceId as string ?? `trace_${randomUUID()}`;
    }

    // Capture pre-mutation performance baseline
    const attributes: SpanAttributes = {
      ...options?.attributes,
      cpuUsageBefore: process.cpuUsage(),
      memoryUsageBefore: process.memoryUsage(),
      traceId,
    };

    const span = new SpanImpl(traceId, parentId, name, type, attributes);

    // Ensure trace exists
    if (!this._traces.has(traceId)) {
      this._traces.set(traceId, new TraceImpl(traceId));
    }
    this._traces.get(traceId)!.addSpan(span);

    this._processor.onStart(span);

    return span;
  }

  endSpan(span: Span, attributes?: SpanAttributes): void {
    if (span.endTime !== null) return;

    // Capture post-mutation performance
    const endAttributes: SpanAttributes = {
      ...attributes,
      cpuUsageAfter: process.cpuUsage(),
      memoryUsageAfter: process.memoryUsage(),
    };

    span.end(endAttributes);
    this._processor.onEnd(span);
  }

  getTrace(traceId: string): Trace | undefined {
    return this._traces.get(traceId);
  }

  getSpans(traceId?: string): Span[] {
    if (traceId) {
      return this._traces.get(traceId)?.spans ?? [];
    }
    const all: Span[] = [];
    for (const [, trace] of this._traces) {
      all.push(...trace.spans);
    }
    return all;
  }

  getActiveTrace(): Trace | undefined {
    // Return the most recently started trace
    let latest: TraceImpl | undefined;
    let latestStart = 0;
    for (const [, trace] of this._traces) {
      if (trace.spans.length > 0) {
        const first = trace.spans[0]!;
        if (first.endTime === null && first.startTime > latestStart) {
          latest = trace;
          latestStart = first.startTime;
        }
      }
    }
    return latest;
  }
}

// ── TraceProvider Implementation ───────────────────────────────

class TraceProviderImpl implements TraceProvider {
  private readonly _tracer: TracerImpl;
  private readonly _processor: SpanProcessor;
  private _shutdown = false;

  constructor(processor: SpanProcessor) {
    this._processor = processor;
    this._tracer = new TracerImpl(processor);
  }

  getTracer(): Tracer {
    return this._tracer;
  }

  async forceFlush(): Promise<void> {
    if (this._shutdown) return;
    await this._processor.forceFlush();
  }

  async shutdown(): Promise<void> {
    if (this._shutdown) return;
    this._shutdown = true;
    await this._processor.forceFlush();
    await this._processor.shutdown();
  }
}

// ── Prometheus Metrics ─────────────────────────────────────────

const spanExportedTotal = new promClient.Counter({
  name: "nexus_trace_spans_exported_total",
  help: "Total number of spans exported",
  labelNames: ["type", "status"],
  registers: [getRegistry()],
});

const spanDurationHistogram = new promClient.Histogram({
  name: "nexus_trace_span_duration_seconds",
  help: "Span duration in seconds",
  labelNames: ["type"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60],
  registers: [getRegistry()],
});

const activeSpansGauge = new promClient.Gauge({
  name: "nexus_trace_active_spans",
  help: "Number of currently active (un-ended) spans",
  registers: [getRegistry()],
});

// ── Singleton / Default Instance ───────────────────────────────

let _provider: TraceProviderImpl | null = null;
let _tracer: Tracer | null = null;

function defaultProcessor(): SpanProcessor {
  const exporter = new DatabaseSpanExporter();
  return new BatchSpanProcessor(exporter);
}

/**
 * Initialize the global trace provider.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initTracing(processor?: SpanProcessor): TraceProvider {
  if (_provider) return _provider;
  _provider = new TraceProviderImpl(processor ?? defaultProcessor());
  _tracer = _provider.getTracer();
  log.info("tracing_initialized");
  return _provider;
}

/**
 * Get the global tracer. Lazily initializes with default processor if needed.
 */
export function getTracer(): Tracer {
  if (!_tracer) {
    initTracing();
  }
  return _tracer!;
}

/**
 * Get the global trace provider.
 */
export function getTraceProvider(): TraceProvider {
  if (!_provider) {
    initTracing();
  }
  return _provider!;
}

/**
 * Force-flush all pending spans and shut down the trace provider.
 */
export async function shutdownTracing(): Promise<void> {
  if (_provider) {
    await _provider.forceFlush();
    await _provider.shutdown();
    _provider = null;
    _tracer = null;
    log.info("tracing_shutdown");
  }
}

// ── Active Span Tracking ───────────────────────────────────────

// SetInterval to update the active spans gauge
let _gaugeTimer: ReturnType<typeof setInterval> | null = null;

export function startActiveSpanTracking(): void {
  if (_gaugeTimer) return;
  _gaugeTimer = setInterval(() => {
    if (!_tracer) return;
    const allSpans = _tracer.getSpans();
    const active = allSpans.filter((s) => s.endTime === null).length;
    activeSpansGauge.set(active);
  }, 1000);
  _gaugeTimer.unref();
}

export function stopActiveSpanTracking(): void {
  if (_gaugeTimer) {
    clearInterval(_gaugeTimer);
    _gaugeTimer = null;
  }
}

// ── High-Level Helpers ────────────────────────────────────────

export interface TracedAgentRunOptions {
  agentId: string;
  agentKind?: string;
  agentRing?: number;
  parentAgentId?: string;
  parentSpanId?: string;
}

/**
 * Start a traced agent span. Automatically captures CPU/memory baselines.
 * Returns the span so the caller can end it.
 */
export function startAgentSpan(
  name: string,
  options: TracedAgentRunOptions,
): Span {
  const tracer = getTracer();
  return tracer.startSpan(name, "agent_span", {
    parentId: options.parentSpanId,
    attributes: {
      agentId: options.agentId,
      agentKind: options.agentKind ?? "sub-agent",
      agentRing: options.agentRing ?? 2,
      parentAgentId: options.parentAgentId,
    },
  });
}

export interface TracedToolCallOptions {
  agentId: string;
  toolName: string;
  toolTarget?: string;
  parentSpanId?: string;
}

/**
 * Start a traced tool span. Links to the parent agent span.
 */
export function startToolSpan(
  name: string,
  options: TracedToolCallOptions,
): Span {
  const tracer = getTracer();
  return tracer.startSpan(name, "tool_span", {
    parentId: options.parentSpanId,
    attributes: {
      agentId: options.agentId,
      toolName: options.toolName,
      toolTarget: options.toolTarget,
    },
  });
}

export interface TracedLLMCallOptions {
  agentId: string;
  model: string;
  provider?: string;
  parentSpanId?: string;
}

/**
 * Start a traced LLM span. Links to the parent agent or tool span.
 */
export function startLLMSpan(
  name: string,
  options: TracedLLMCallOptions,
): Span {
  const tracer = getTracer();
  return tracer.startSpan(name, "llm_span", {
    parentId: options.parentSpanId,
    attributes: {
      agentId: options.agentId,
      model: options.model,
      provider: options.provider,
    },
  });
}

export interface TracedHandoffOptions {
  fromAgentId: string;
  toAgentId: string;
  handoffReason?: string;
  parentSpanId?: string;
}

/**
 * Start a traced handoff span. Captures agent-to-agent delegation.
 */
export function startHandoffSpan(
  name: string,
  options: TracedHandoffOptions,
): Span {
  const tracer = getTracer();
  return tracer.startSpan(name, "handoff_span", {
    parentId: options.parentSpanId,
    attributes: {
      fromAgentId: options.fromAgentId,
      toAgentId: options.toAgentId,
      handoffReason: options.handoffReason,
    },
  });
}

/**
 * Record LLM token usage on an existing llm_span.
 */
export function recordTokenUsage(
  span: Span,
  usage: { prompt?: number; completion?: number; total?: number },
): void {
  span.setAttribute("promptTokens", usage.prompt ?? 0);
  span.setAttribute("completionTokens", usage.completion ?? 0);
  span.setAttribute("totalTokens", usage.total ?? (usage.prompt ?? 0) + (usage.completion ?? 0));
}

/**
 * Record an error on any span type.
 */
export function recordSpanError(
  span: Span,
  error: string,
  errorCode?: string,
): void {
  span.setStatus("error");
  span.setAttribute("error", error);
  if (errorCode) span.setAttribute("errorCode", errorCode);
  span.addEvent("error", { error, errorCode });
}

/**
 * End a span and record final attributes. Optionally link to the audit log.
 * If `auditAction` is provided, an audit entry is created referencing the trace.
 */
export async function endTracedSpan(
  span: Span,
  attributes?: SpanAttributes & { auditAction?: string; auditActor?: string },
): Promise<void> {
  const tracer = getTracer();
  tracer.endSpan(span, attributes);

  // Optionally create an audit entry linking back to the trace
  if (attributes?.auditAction && attributes?.auditActor) {
    await appendAudit(
      attributes.auditAction,
      {
        traceId: span.traceId,
        spanId: span.id,
        spanName: span.name,
        spanType: span.type,
        durationMs: span.durationMs,
        status: span.status,
        attributes: span.attributes,
      },
      attributes.auditActor,
    ).catch((e) => {
      log.warn("span_audit_link_failed", { error: e instanceof Error ? e.message : String(e) });
    });
  }
}

// ── Kernel Integration ─────────────────────────────────────────

/**
 * Wrap a kernel syscall function with automatic tracing.
 * The returned function creates a tool span, calls the original, and ends the span.
 * Works with any async function — integrates with the existing kernel ACL checks.
 */
export function traceKernelSyscall<TArgs extends unknown[], TResult>(
  agentId: string,
  syscallName: string,
  fn: (...args: TArgs) => Promise<TResult>,
  options?: { parentSpanId?: string },
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const span = startToolSpan(`syscall.${syscallName}`, {
      agentId,
      toolName: syscallName,
      parentSpanId: options?.parentSpanId,
    });

    try {
      const result = await fn(...args);
      span.setAttribute("toolExitCode", 0);
      span.setAttribute("toolAuthorized", true);
      return result;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      recordSpanError(span, errMsg, "KERNEL_SYSCALL_ERROR");
      throw e;
    } finally {
      getTracer().endSpan(span);
    }
  };
}

// ── Agent Runtime Integration ──────────────────────────────────

/**
 * Create an agent execution trace — a root agent span + automatic
 * child span tracking via the returned context object.
 */
export function createAgentTrace(
  agentId: string,
  goal: string,
  options?: { kind?: string; ring?: number; parentAgentId?: string; parentSpanId?: string },
): { rootSpan: Span; traceId: string } {
  const rootSpan = startAgentSpan(`agent.${options?.kind ?? "run"}`, {
    agentId,
    agentKind: options?.kind,
    agentRing: options?.ring,
    parentAgentId: options?.parentAgentId,
    parentSpanId: options?.parentSpanId,
  });
  rootSpan.setAttribute("goal", goal);

  return { rootSpan, traceId: rootSpan.traceId };
}

/**
 * Complete an agent execution trace — end root span with
 * aggregated metrics and audit linkage.
 */
export async function completeAgentTrace(
  rootSpan: Span,
  result: { ok: boolean; iterations: number; tokensUsed: number; answer?: string; error?: string },
  actor: string,
): Promise<void> {
  rootSpan.setAttribute("iterations", result.iterations);
  rootSpan.setAttribute("tokensUsed", result.tokensUsed);
  rootSpan.setAttribute("answerLength", result.answer?.length ?? 0);

  await endTracedSpan(rootSpan, {
    auditAction: result.ok ? "agent_runtime.finished" : "agent_runtime.failed",
    auditActor: actor,
    ...(result.error ? { error: result.error } : {}),
  });
}

// ── Re-exports for convenience ─────────────────────────────────

export type { TraceProviderImpl };
