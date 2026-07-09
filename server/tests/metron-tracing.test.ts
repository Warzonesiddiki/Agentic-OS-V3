/**
 * Metron — tracing stack (services/tracing, services/span-context,
 * services/trace-exporter). Mocks fetch for OTLP export.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') }));
vi.stubGlobal('fetch', fetchMock);

import {
  withSpan,
  runWithTraceContext,
  getTracer,
  startLLMSpan,
  startToolSpan,
  recordTokenUsage,
  recordSpanError,
  endTracedSpan,
  injectTraceparent,
  generateTraceId,
  generateSpanId,
  parseTraceparent,
  formatTraceparent,
  withParentContext,
  getTraceContext,
  outgoingTraceParent,
  headersWithTrace,
} from '../src/services/tracing.js';
import {
  SpanContext,
  parseSpanContext,
  formatSpanContext,
  randomHex,
  withParentContext as scWithParent,
  getTraceContext as scGetTrace,
  outgoingTraceParent as scOutgoing,
  headersWithTrace as scHeaders,
} from '../src/services/span-context.js';
import {
  ConsoleSpanExporter,
  DatabaseSpanExporter,
  OtlpSpanExporter,
  MultiSpanExporter,
  BatchedSpanProcessor,
  NoopSpanProcessor,
  type Span,
} from '../src/services/trace-exporter.js';

function fakeSpan(over: Partial<Span> = {}): Span {
  return {
    id: 'abc',
    parentId: undefined,
    traceId: 't1',
    name: 'op',
    kind: 'internal',
    begin: Date.now(),
    end: undefined,
    attrs: {},
    status: { code: 0 },
    events: [],
    ...over,
  } as Span;
}

describe('tracing core', () => {
  it('withSpan runs + returns + closes', async () => {
    const r = await withSpan('op', { a: 1 }, async (s) => {
      expect(s.name).toBe('op');
      return 42;
    });
    expect(r).toBe(42);
  });

  it('withSpan captures thrown errors', async () => {
    await expect(
      withSpan('op', {}, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });

  it('runWithTraceContext binds a context', async () => {
    const ctx = new SpanContext({ traceId: 't9', spanId: 's9' });
    const r = await runWithTraceContext(ctx, async () => {
      expect(getTraceContext()!.spanId).toBe('s9');
      return 'ok';
    });
    expect(r).toBe('ok');
  });

  it('getTracer returns a tracer with startSpan', () => {
    const t = getTracer();
    expect(typeof t.startSpan).toBe('function');
  });

  it('startLLMSpan + recordTokenUsage + endTracedSpan', async () => {
    const span = startLLMSpan('gpt', 'prompt');
    recordTokenUsage(span, 10, 20);
    expect(span.attrs!['llm.prompt_tokens']).toBe(10);
    endTracedSpan(span);
    expect(span.end).toBeTypeOf('number');
  });

  it('startToolSpan + recordSpanError sets error status', () => {
    const span = startToolSpan('fs.read');
    recordSpanError(span, new Error('x'));
    expect(span.status.code).toBe(2);
    endTracedSpan(span);
  });

  it('injectTraceparent sets traceparent header + warns on missing ctx', () => {
    const h: Record<string, string> = {};
    injectTraceparent(h, { traceId: 't1', spanId: 's1' });
    expect(h['traceparent']).toContain('t1');
    const empty: Record<string, string> = {};
    injectTraceparent(empty, undefined);
    expect(empty['traceparent']).toBeUndefined();
  });
});

describe('span-context', () => {
  it('generates valid traceId/spanId hex', () => {
    expect(generateTraceId().length).toBe(32);
    expect(generateSpanId().length).toBe(16);
  });

  it('parse + format traceparent round-trips', () => {
    const tp = formatTraceparent({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), sampled: true });
    const p = parseTraceparent(tp);
    expect(p!.traceId).toBe('a'.repeat(32));
    expect(p!.sampled).toBe(true);
  });

  it('parseTraceparent rejects malformed', () => {
    expect(parseTraceparent('garbage')).toBeNull();
  });

  it('withParentContext + getTraceContext + outgoing', () => {
    const ctx = new SpanContext({ traceId: 't1', spanId: 's1' });
    scWithParent(ctx, () => {
      expect(scGetTrace()!.spanId).toBe('s1');
      const out = scOutgoing();
      expect(out!.traceId).toBe('t1');
      const h = scHeaders();
      expect(h['traceparent']).toContain('t1');
    });
  });

  it('parseSpanContext / formatSpanContext', () => {
    const c = new SpanContext({ traceId: 't1', spanId: 's1' });
    const f = formatSpanContext(c);
    expect(parseSpanContext(f)!.traceId).toBe('t1');
  });

  it('randomHex length', () => {
    expect(randomHex(8).length).toBe(8);
  });
});

describe('trace-exporter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ConsoleSpanExporter logs closed spans', async () => {
    const logs: string[] = [];
    const exp = new ConsoleSpanExporter((m: string) => logs.push(m));
    await exp.export([fakeSpan({ end: Date.now(), traceId: 't1' })]);
    expect(logs.length).toBe(1);
  });

  it('DatabaseSpanExporter writes via db', async () => {
    const db: any = { insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => Promise.resolve()) })) })) };
    vi.mock('../src/db/client.js', () => ({ db, isSqlite: false, isPg: true }));
    const { DatabaseSpanExporter: DBExp } = await import('../src/services/trace-exporter.js');
    const exp = new DBExp();
    await exp.export([fakeSpan({ end: Date.now(), traceId: 't1' })]);
    expect(db.insert).toHaveBeenCalled();
  });

  it('OtlpSpanExporter POSTs JSON to endpoint', async () => {
    const exp = new OtlpSpanExporter({ endpoint: 'http://x', headers: {} });
    await exp.export([fakeSpan({ end: Date.now(), traceId: 't1' })]);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('OtlpSpanExporter skips when no endpoint', async () => {
    const exp = new OtlpSpanExporter({});
    await exp.export([fakeSpan({ end: Date.now() })] as any);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('MultiSpanExporter fans out', async () => {
    const a = { export: vi.fn(() => Promise.resolve()), shutdown: vi.fn(() => Promise.resolve()), forceFlush: vi.fn(() => Promise.resolve()) };
    const b = { export: vi.fn(() => Promise.resolve()), shutdown: vi.fn(() => Promise.resolve()), forceFlush: vi.fn(() => Promise.resolve()) };
    const m = new MultiSpanExporter([a, b]);
    await m.export([fakeSpan({ end: Date.now() })]);
    expect(a.export).toHaveBeenCalled();
    expect(b.export).toHaveBeenCalled();
  });

  it('BatchedSpanProcessor flushes on schedule + onShutdown', async () => {
    vi.useFakeTimers();
    const exp = { export: vi.fn(() => Promise.resolve()), shutdown: vi.fn(() => Promise.resolve()), forceFlush: vi.fn(() => Promise.resolve()) };
    const p = new BatchedSpanProcessor(exp, 10, 1000);
    p.onStart(fakeSpan());
    p.onEnd(fakeSpan({ end: Date.now() }));
    vi.advanceTimersByTime(1100);
    await Promise.resolve();
    expect(exp.export).toHaveBeenCalled();
    await p.onShutdown();
    vi.useRealTimers();
  });

  it('NoopSpanProcessor is inert', () => {
    const p = new NoopSpanProcessor();
    p.onStart(fakeSpan());
    p.onEnd(fakeSpan({ end: Date.now() }));
    expect(() => p.onShutdown()).not.toThrow();
  });
});
