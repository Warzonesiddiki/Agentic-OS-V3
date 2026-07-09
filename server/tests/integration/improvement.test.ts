import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../src/db/client.js';
import { metricSnapshots, improvementProposals } from '../../src/db/schema.js';
import {
  recordMetric,
  collectRecentMetrics,
  harnessTick,
  listProposals,
} from '../../src/services/self-improvement-harness.js';

describe('Metrics and Self-Improvement Integration Suite', () => {
  beforeAll(async () => {
    // Clear out testing tables safely
    await db.delete(metricSnapshots);
    await db.delete(improvementProposals);
  });

  it('records, collects, and processes telemetry to trigger self-improvement proposals', async () => {
    const metricName = 'nexus_http_request_p99_latency';

    // 1. Record 25 baseline metrics (stable low latency)
    for (let i = 0; i < 25; i++) {
      await recordMetric(metricName, 20 + Math.random() * 5, 60_000, { route: '/api/v1/health' });
    }

    // 2. Record 25 regression metrics (spike high latency)
    for (let i = 0; i < 25; i++) {
      await recordMetric(metricName, 150 + Math.random() * 20, 60_000, { route: '/api/v1/health' });
    }

    // 3. Collect and verify summarization
    const window = await collectRecentMetrics(metricName, 100);
    expect(window.n).toBe(50);
    expect(window.mean).toBeGreaterThan(20);
    expect(window.p95).toBeGreaterThan(150);

    // 4. Tick the harness loop. Regression detection should fire a proposal.
    const result = await harnessTick({
      metrics: [metricName],
      thresholds: { [metricName]: 0.15 },
    });

    expect(result.proposalsCreated).toBe(1);

    // 5. Query proposals to ensure proposal schema details match expectation
    const proposals = await listProposals({ status: 'draft' });
    expect(proposals.length).toBe(1);
    expect(proposals[0]?.targetMetric).toBe(metricName);
    expect(proposals[0]?.riskClass).toBe('ADVISORY');
    expect(proposals[0]?.patch.kind).toBe('feature_flag');
  });
});
