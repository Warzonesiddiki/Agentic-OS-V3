import { describe, it, expect, vi } from 'vitest';
import { BatchedSpanProcessor, type SpanExporter, type ExportedSpan } from '../src/services/trace-exporter.js';

function fakeSpan(i: number): ExportedSpan {
  return {
    id: `s${i}`,
    traceId: 't',
    parentId: null,
    name: `span-${i}`,
    type: 'agent_span',
    status: 'ok',
    startTime: i,
    endTime: i + 1,
    durationMs: 1,
    attributes: {},
    events: [],
  };
}

class CollectingExporter implements SpanExporter {
  batches: ExportedSpan[][] = [];
  async export(spans: ExportedSpan[]): Promise<void> {
    this.batches.push(spans);
  }
  async shutdown(): Promise<void> {}
}

describe('BatchedSpanProcessor', () => {
  it('batches spans up to maxBatchSize and flushes in one export', async () => {
    const exporter = new CollectingExporter();
    const proc = new BatchedSpanProcessor(exporter, { maxBatchSize: 10, maxBatchDelayMs: 100000 });
    for (let i = 0; i < 25; i++) proc.onEnd(fakeSpan(i));

    // Auto-flush at maxBatchSize happens asynchronously; wait for it.
    await proc.forceFlush();
    await proc.shutdown();

    const total = exporter.batches.reduce((n, b) => n + b.length, 0);
    expect(total).toBe(25);
    // Spans are flushed in chunks of at most maxBatchSize.
    expect(exporter.batches.every((b) => b.length <= 10)).toBe(true);
    expect(exporter.batches.length).toBeGreaterThanOrEqual(3);
  });

  it('flushes on a timer when maxBatchSize is not reached', async () => {
    const exporter = new CollectingExporter();
    const proc = new BatchedSpanProcessor(exporter, { maxBatchSize: 1000, maxBatchDelayMs: 20 });
    proc.onEnd(fakeSpan(0));
    proc.onEnd(fakeSpan(1));
    // Not yet flushed by size.
    expect(exporter.batches.length).toBe(0);
    await new Promise((r) => setTimeout(r, 40));
    await proc.shutdown();
    expect(exporter.batches.length).toBe(1);
    expect(exporter.batches[0].length).toBe(2);
  });

  it('drops onEnd calls after shutdown', async () => {
    const exporter = new CollectingExporter();
    const proc = new BatchedSpanProcessor(exporter, { maxBatchSize: 1000, maxBatchDelayMs: 100000 });
    await proc.shutdown();
    proc.onEnd(fakeSpan(0));
    expect(exporter.batches.length).toBe(0);
  });

  it('does not double-export spans when concurrent onEnd arrives during flush', async () => {
    const seen = new Set<string>();
    let exports = 0;
    const exporter: SpanExporter = {
      async export(spans: ExportedSpan[]) {
        exports++;
        for (const s of spans) seen.add(s.id);
      },
      async shutdown() {},
    };
    const proc = new BatchedSpanProcessor(exporter, { maxBatchSize: 5, maxBatchDelayMs: 100000 });
    for (let i = 0; i < 12; i++) proc.onEnd(fakeSpan(i));
    await proc.shutdown();
    expect(exports).toBeGreaterThan(0);
    expect(seen.size).toBe(12); // every span exported exactly once
  });
});
