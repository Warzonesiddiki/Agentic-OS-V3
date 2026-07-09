/**
 * hooks.ts — reusable hooks for v3 API calls.
 *
 * useV3Query encapsulates the loading/data/error-toast pattern that every
 * v3 page repeats: set loading → call v3.call → set data or toast.danger → clear loading.
 *
 * Features:
 * - Stale-while-loading: only shows loading skeleton on first mount, not on refetch
 * - isRefetching: indicates a background refetch is in progress (for subtle indicators)
 * - Automatic cancellation: prevents state updates after unmount
 * - Reactive deps: re-fetches when dependency array changes
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { v3 } from "./remote";
import { toast } from "./toast";

/* ─── useV3Query ──────────────────────────────────────────────────────────── */

export interface V3QueryResult<T> {
  data: T | null;
  loading: boolean;
  /** True while a background refetch is in progress (stale data visible). */
  isRefetching: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetch data from a v3 endpoint reactively with stale-while-loading.
 *
 * On first mount, loading starts as `true`. On subsequent refetches (triggered
 * by deps change or manual refetch()), loading stays `false` while stale data
 * is displayed, but `isRefetching` becomes `true` for subtle UI indicators.
 *
 * @param path  URL path to fetch.
 * @param deps  Dependency array — the query re-runs when any dep changes.
 *
 * @example
 *   const { data, loading, isRefetching } = useV3Query<Plugin[]>("/api/v1/v3/plugins", []);
 */
export function useV3Query<T>(path: string, deps: unknown[] = []): V3QueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const hasLoaded = useRef(false);
  // Monotonic request token. When deps change rapidly, two requests can be
  // in flight at once; the LATER one must win and the EARLIER (stale) one must
  // be ignored so we never overwrite fresh data with stale data.
  const reqSeq = useRef(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    const myReq = ++reqSeq.current;
    const controller = new AbortController();
    let cancelled = false;
    if (!hasLoaded.current) {
      setLoading(true);
    } else {
      setIsRefetching(true);
    }

    v3.call<T>(path, { signal: controller.signal }).then(d => {
      // Drop stale/out-of-order responses and post-unmount updates.
      if (cancelled || myReq !== reqSeq.current) return;
      hasLoaded.current = true;
      if (d.ok) {
        setData(d.data as T);
        setError(null);
      } else {
        const msg = d.error?.message || "Failed to load";
        setError(msg);
        toast.danger(msg);
      }
    }).catch((e: unknown) => {
      // AbortError = intentional cancel (unmount/dep change) - swallow it.
      if (cancelled || myReq !== reqSeq.current) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      const msg = e instanceof Error ? e.message : "Failed to load";
      setError(msg);
      toast.danger(msg);
    }).finally(() => {
      if (!cancelled && myReq === reqSeq.current) {
        setLoading(false);
        setIsRefetching(false);
      }
    });

    return () => { cancelled = true; controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, loading, isRefetching, error, refetch };
}
