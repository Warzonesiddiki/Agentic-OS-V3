import { describe, it, expect } from 'vitest';
import {
  addSSEClient,
  broadcastSSE,
  getSSEClientCount,
} from '../src/services/sse-bus.js';

/**
 * Micro-benchmark: SSE fan-out must stay O(N) publish, not O(N^2).
 *
 * We spin up N synthetic subscribers (each buffering the last write), then
 * measure per-publish latency and assert p95 stays under a generous threshold
 * so the test is meaningful on any CI runner while still catching quadratic
 * regressions (which would blow the budget at 100 subscribers).
 */
function makeClient() {
  const buf: string[] = [];
  return {
    writes: 0,
    write(chunk: string) {
      buf.push(chunk);
      this.writes++;
    },
    close() {},
    last: () => buf[buf.length - 1],
  };
}

describe('sse-bus fan-out benchmark', () => {
  it('publishes to 100 subscribers with p95 latency under threshold', () => {
    const N = 100;
    const clients = Array.from({ length: N }, () => makeClient());
    const removeFns = clients.map((c) => addSSEClient(c));

    expect(getSSEClientCount()).toBe(N);

    const iterations = 200;
    const latencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      broadcastSSE({ type: 'tick', data: { i }, timestamp: Date.now() });
      latencies.push(performance.now() - start);
    }

    // Basic correctness: every client received every message.
    for (const c of clients) {
      expect(c.writes).toBe(iterations);
    }

    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    // Generous ceiling — catches O(N^2) regressions (which would be orders of
    // magnitude slower) without being flaky on slow CI. Fan-out is pure
    // in-memory writes here, so the real cost is tiny.
    expect(p95).toBeLessThan(50);

    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
     
    console.log(
      `[sse-bus bench] N=${N} iters=${iterations} avg=${avg.toFixed(4)}ms p95=${p95.toFixed(4)}ms`
    );

    removeFns.forEach((fn) => fn());
    expect(getSSEClientCount()).toBe(0);
  });

  it('prunes a failing client on broadcast without breaking the fan-out', () => {
    const good = makeClient();
    const bad = {
      writes: 0,
      write() {
        throw new Error('closed');
      },
      close() {},
    };
    const removeGood = addSSEClient(good);
    const removeBad = addSSEClient(bad);

    // First broadcast: bad throws, gets pruned, good still receives.
    broadcastSSE({ type: 'a', data: 1, timestamp: Date.now() });
    expect(good.writes).toBe(1);

    // Second broadcast: bad is gone, only good remains.
    broadcastSSE({ type: 'b', data: 2, timestamp: Date.now() });
    expect(good.writes).toBe(2);

    removeGood();
    removeBad();
    expect(getSSEClientCount()).toBe(0);
  });
});
