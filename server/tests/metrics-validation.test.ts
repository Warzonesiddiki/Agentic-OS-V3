import { describe, it, expect } from 'vitest';
import { validateMetrics } from '../src/services/metrics-validation.js';

describe('Metrics Validation Engine', () => {
  it('returns a well-formed validation report with status and threshold results', async () => {
    const report = await validateMetrics();
    expect(report.timestamp).toBeDefined();
    expect(typeof report.success).toBe('boolean');
    expect(Array.isArray(report.results)).toBe(true);

    const errorRate = report.results.find((r) => r.metric === 'http_error_rate');
    expect(errorRate).toBeDefined();
    expect(errorRate?.threshold).toBe('< 5%');

    const dbDuration = report.results.find((r) => r.metric === 'avg_db_query_duration_ms');
    expect(dbDuration).toBeDefined();
    expect(dbDuration?.threshold).toBe('< 100ms');
  });
});
