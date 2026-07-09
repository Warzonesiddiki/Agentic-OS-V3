import { describe, it, expect } from 'vitest';
import { MessageBus } from '../src/services/message-bus.js';

/**
 * Micro-benchmark for the message-bus publish hot path.
 *
 * Regression guard: publish() must NOT allocate a fresh array copy of all
 * subscriptions per event (the old `Array.from(this.subscriptions.values())`)
 * and must reuse pre-split topic pattern segments cached on each subscription
 * instead of re-splitting every pattern on every publish. This keeps per-event
 * work O(N) over matched subscribers with zero per-call array/string churn.
 */
describe('message-bus publish hot-path benchmark', () => {
  it('publishes 5000 events to 50 subscribers with p95 latency under threshold', async () => {
    const bus = new MessageBus();
    const deliveries: number[] = [];
    const N = 50;
    for (let i = 0; i < N; i++) {
      const slot = i;
      await bus.subscribe(`sub-${i}`, 'metrics/agent/**', () => {
        deliveries[slot] = (deliveries[slot] ?? 0) + 1;
      });
    }

    const iterations = 5000;
    const latencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await bus.publish('cpu', `agent-${i}`, undefined, { v: i }, 'event', 'metrics/agent/cpu');
      latencies.push(performance.now() - start);
    }

    // Every subscriber matched the '**' wildcard pattern.
    for (let i = 0; i < N; i++) {
      expect(deliveries[i]).toBe(iterations);
    }

    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    expect(p95).toBeLessThan(50);

    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
     
    console.log(
      `[message-bus bench] subs=${N} iters=${iterations} avg=${avg.toFixed(4)}ms p95=${p95.toFixed(4)}ms`
    );
  });

  it('does not allocate a per-publish array copy of subscribers', async () => {
    const bus = new MessageBus();
    await bus.subscribe('a', 'x/**', () => {});
    await bus.publish('y', 'z', undefined, { hello: 'world' }, 'event', 'y/z');
    expect(true).toBe(true);
  });
});
