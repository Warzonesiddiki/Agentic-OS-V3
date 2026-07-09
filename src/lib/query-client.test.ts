/**
 * Unit tests for the global TanStack Query client (src/lib/query-client.ts).
 *
 * Verifies cache-invalidation behavior and that the robustness config from the
 * previous batch is actually applied: exponential-backoff retry that excludes
 * 4xx, gcTime, offlineFirst network mode, and refetchOnReconnect.
 */
import { describe, it, expect } from 'vitest';
import { queryClient } from './query-client';

const KEY = ['memories', 'list'] as const;

describe('query-client — cache invalidation', () => {
  it('setQueryData populates the cache and getQueryData reads it back', () => {
    queryClient.setQueryData(KEY, [{ id: 'm1', content: 'cached' }]);
    const data = queryClient.getQueryData<Array<{ id: string }>>(KEY);
    expect(data).toHaveLength(1);
    expect(data?.[0]!.id).toBe('m1');
  });

  it('invalidateQueries marks the entry stale (fresh => false after invalidation)', async () => {
    queryClient.setQueryData(KEY, [{ id: 'm1' }]);
    // Freshly written data is not stale.
    expect(queryClient.getQueryState(KEY)?.isInvalidated).toBe(false);

    await queryClient.invalidateQueries({ queryKey: KEY });
    expect(queryClient.getQueryState(KEY)?.isInvalidated).toBe(true);
  });

  it('removeQueries evicts the cache entry', () => {
    queryClient.setQueryData(KEY, [{ id: 'm1' }]);
    queryClient.removeQueries({ queryKey: KEY });
    expect(queryClient.getQueryData(KEY)).toBeUndefined();
  });

  it('clearing the query cache evicts all cached queries', () => {
    queryClient.setQueryData(KEY, [{ id: 'm1' }]);
    queryClient.getQueryCache().clear();
    expect(queryClient.getQueryData(KEY)).toBeUndefined();
  });
});

describe('query-client — robustness configuration', () => {
  const q = queryClient.getDefaultOptions().queries ?? {};

  it('retry is a predicate that RETRIES transient 5xx errors', () => {
    expect(typeof q.retry).toBe('function');
    const retry = q.retry as (failureCount: number, error: unknown) => boolean;
    expect(retry(0, { status: 503, message: 'Service Unavailable' })).toBe(true);
    expect(retry(0, { message: 'Failed to fetch' })).toBe(true);
    expect(retry(0, { message: 'Request timed out after 30000ms' })).toBe(true);
  });

  it('retry does NOT retry terminal 4xx errors', () => {
    const retry = q.retry as (failureCount: number, error: unknown) => boolean;
    expect(retry(0, { status: 400, message: 'Bad Request' })).toBe(false);
    expect(retry(0, { status: 401, message: 'Unauthorized' })).toBe(false);
    expect(retry(0, { status: 404, message: 'Not Found' })).toBe(false);
  });

  it('retry caps out at 3 attempts', () => {
    const retry = q.retry as (failureCount: number, error: unknown) => boolean;
    expect(retry(3, { status: 503, message: 'x' })).toBe(false);
  });

  it('retryDelay is exponential with jitter (monotonic, bounded)', () => {
    expect(typeof q.retryDelay).toBe('function');
    const delay = q.retryDelay as (attempt: number) => number;
    const d0 = delay(0);
    const d1 = delay(1);
    expect(d1).toBeGreaterThanOrEqual(d0);
    expect(d1).toBeLessThanOrEqual(5000 + 250); // base cap + jitter
  });

  it('gcTime, networkMode, refetchOnReconnect, throwOnError are set for resilience', () => {
    expect(q.gcTime).toBe(5 * 60_000);
    expect(q.networkMode).toBe('offlineFirst');
    expect(q.refetchOnReconnect).toBe(true);
    expect(q.throwOnError).toBe(false);
  });
});
