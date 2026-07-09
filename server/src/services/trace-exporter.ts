import { log } from '../lib/logging.js';
import { getEnv } from '../lib/env.js';

const isSqlite = !(getEnv().DATABASE_URL || '').startsWith('postgres');
import { db } from '../db/client.js';

export type SpanType = 'agent_span' | 'tool_span' | 'llm_span' | 'handoff_span';
export type SpanStatus = 'ok' | 'error' | 'cancelled';

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface SpanAttributes {
  agentId?: string;
  agentKind?: string;
  agentRing?: number;
  parentAgentId?: string;
  toolName?: string;
  toolTarget?: string;
  toolAuthorized?: boolean;
  toolExitCode?: number;
  model?: string;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  fromAgentId?: string;
  toAgentId?: string;
  handoffReason?: string;
  cpuUsageBefore?: NodeJS.CpuUsage;
  cpuUsageAfter?: NodeJS.CpuUsage;
  memoryUsageBefore?: NodeJS.MemoryUsage;
  memoryUsageAfter?: NodeJS.MemoryUsage;
  error?: string;
  errorCode?: string;
  [key: string]: unknown;
}

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

export interface SpanProcessor {
  onStart(span: unknown): void;
  onEnd(span: unknown): void;
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

export class ConsoleSpanExporter implements SpanExporter {
  async export(spans: ExportedSpan[]): Promise<void> {
    for (const span of spans) {
      log.debug('span_exported', {
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
        attributes: isSqlite ? JSON.stringify(s.attributes) : s.attributes,
        events: isSqlite ? JSON.stringify(s.events) : s.events,
      }));

      const { spanLogs } = await import('../db/client.js');
      await db
        .insert(spanLogs)
        .values(values as never[])
        .onConflictDoNothing();
    } catch (e) {
      log.error('span_db_export_failed', {
        count: spans.length,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async shutdown(): Promise<void> {
    this._shutdown = true;
  }
}

export class OtlpSpanExporter implements SpanExporter {
  private readonly _endpoint: string;
  private readonly _apiKey?: string;

  constructor(options?: { endpoint?: string; apiKey?: string }) {
    const env = getEnv();
    this._endpoint =
      options?.endpoint ?? env.NEXUS_OTEL_ENDPOINT ?? 'http://localhost:4318/v1/traces';
    this._apiKey = options?.apiKey ?? env.NEXUS_OTEL_API_KEY;
  }

  async export(spans: ExportedSpan[]): Promise<void> {
    if (!this._endpoint || spans.length === 0) return;
    try {
      const otlpSpans = spans.map((s) => ({
        traceId: s.traceId
          .replace(/[^0-9a-f]/gi, '')
          .padStart(32, '0')
          .slice(0, 32),
        spanId: s.id
          .replace(/[^0-9a-f]/gi, '')
          .padStart(16, '0')
          .slice(0, 16),
        parentSpanId: s.parentId
          ? s.parentId
              .replace(/[^0-9a-f]/gi, '')
              .padStart(16, '0')
              .slice(0, 16)
          : undefined,
        name: s.name,
        kind: 1, // INTERNAL
        startTimeUnixNano: String(Math.round(s.startTime * 1_000_000)),
        endTimeUnixNano: String(Math.round((s.endTime ?? performance.now()) * 1_000_000)),
        attributes: Object.entries(s.attributes).map(([key, value]) => ({
          key,
          value: { stringValue: typeof value === 'object' ? JSON.stringify(value) : String(value) },
        })),
        status: { code: s.status === 'ok' ? 1 : 2 },
      }));

      const payload = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'nexus-server' } },
                { key: 'service.version', value: { stringValue: '2.0.0' } },
              ],
            },
            scopeSpans: [{ spans: otlpSpans }],
          },
        ],
      };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this._apiKey) headers['Authorization'] = `Bearer ${this._apiKey}`;

      await fetch(this._endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      }).catch((e) => {
        log.debug('otlp_fetch_failed', { error: e instanceof Error ? e.message : String(e) });
      });
    } catch (e) {
      log.warn('otlp_export_failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  async shutdown(): Promise<void> {}
}

export class MultiSpanExporter implements SpanExporter {
  private readonly _exporters: SpanExporter[];

  constructor(exporters: SpanExporter[]) {
    this._exporters = exporters;
  }

  async export(spans: ExportedSpan[]): Promise<void> {
    await Promise.all(this._exporters.map((e) => e.export(spans)));
  }

  async shutdown(): Promise<void> {
    await Promise.all(this._exporters.map((e) => e.shutdown()));
  }
}
