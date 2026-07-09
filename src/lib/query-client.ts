import { QueryClient } from '@tanstack/react-query';

/** Exponential backoff with jitter so a storm of retries doesn't hit the
 *  backend in lockstep. Capped at ~12s per attempt. */
function retryDelay(attempt: number): number {
  const base = Math.min(5000, 1000 * 2 ** attempt);
  const jitter = Math.random() * 250;
  return base + jitter;
}

/** Retry only on transient failures: network errors (no response), timeouts,
 *  and 5xx. 4xx (bad request / unauthorized / not found) are terminal — retrying
 *  them just burns requests and can wedge the UI in a retry loop. */
function retryPredicate(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  const err = error as { message?: string; status?: number };
  const msg = err?.message ?? '';
  if (msg.includes('timed out')) return true; // ApiTimeoutError
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return true;
  if (typeof err?.status === 'number' && err.status >= 500) return true;
  return false;
}

/**
 * Global TanStack Query client for the control plane.
 * Every read/write in the app MUST go through this layer -> api-client -> Hono backend.
 * No localStorage caching of business data is allowed; the cache is an in-memory
 * mirror of authoritative backend state, invalidated by SSE events.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: retryPredicate,
      retryDelay,
      // Keep failed/empty caches out of memory longer than the window so a
      // flapping backend doesn't thrash GC; 5 min is the safety valve.
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      // Resume paused queries once connectivity returns instead of erroring.
      networkMode: 'offlineFirst',
      refetchOnReconnect: true,
      throwOnError: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
