/**
 * http.ts — SSRF-safe outbound fetch with timeouts.
 *
 * assertPublicHost was previously written but never called (the LLM/embedding
 * path was a stub), so "SSRF protection" protected nothing. All outbound calls
 * (embeddings, LLM) MUST go through safeFetch, which resolves DNS and rejects
 * private/loopback/link-local targets before any connection is made.
 */
import { assertPublicHost } from './guards.js';
import { injectTraceparent } from '../services/tracing.js';

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  body: unknown;
  error?: string;
}

/**
 * Fetch a URL with SSRF + timeout guards. Throws (caller-visible) if the host
 * is private/loopback/link-local or the request exceeds `timeoutMs`.
 */
export async function safeFetch(
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {}
): Promise<SafeFetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, status: 0, body: null, error: 'Invalid URL.' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, status: 0, body: null, error: `Blocked scheme: ${parsed.protocol}` };
  }
  // SSRF guard — reject private/loopback/link-local/metadata hosts BEFORE connect.
  await assertPublicHost(parsed.hostname);

  const requestHeaders: Record<string, string> = { ...(init.headers || {}) };
  injectTraceparent(requestHeaders);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: requestHeaders,
      body: init.body,
      signal: controller.signal,
    });
    const body = res.headers.get('content-type')?.includes('application/json')
      ? await res.json()
      : await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: e instanceof Error ? e.message : 'fetch failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}
