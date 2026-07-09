/**
 * @agentic-os/sdk — typed TypeScript client for the NEXUS Agentic OS API.
 *
 * Phase 16 deliverable: zero-compromise TS client with full generics, fetch
 * transport, structured error mapping, automatic retry/backoff, and cursor
 * pagination. Ships ESM + CJS (see package.json `exports` + `tsc` dual build).
 */

export interface NexusClientOptions {
  /** Base URL of the NEXUS API, e.g. http://localhost:8787 or https://api.nexus.dev */
  baseUrl: string;
  /** Bearer / API token. */
  token?: string;
  /** Extra default headers (e.g. x-tenant). */
  headers?: Record<string, string>;
  /** Fetch implementation override (defaults to globalThis.fetch). Useful for Node <18 or tests. */
  fetchImpl?: typeof fetch;
  /** Max automatic retries on 429/5xx. Default 3. */
  maxRetries?: number;
  /** Base backoff ms. Default 300. */
  backoffMs?: number;
}

export interface NexusRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path relative to baseUrl (without leading /api/v1 requirement — pass full path). */
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /** Override retries for this call. */
  maxRetries?: number;
}

export interface NexusEnvelope<T> {
  jsonrpc?: string;
  id?: string;
  ok: boolean;
  requestId: string;
  result?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
    traceId?: string;
  };
}

export interface NexusPage<T> {
  items: T[];
  total: number;
  nextCursor?: string;
}

/** Thrown for non-2xx responses with a structured error payload. */
export class NexusApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly details?: unknown;
  constructor(params: {
    code: string;
    message: string;
    status: number;
    requestId?: string;
    traceId?: string;
    details?: unknown;
  }) {
    super(`[${params.code}] ${params.message}`);
    this.name = 'NexusApiError';
    this.code = params.code;
    this.status = params.status;
    this.requestId = params.requestId;
    this.traceId = params.traceId;
    this.details = params.details;
    Object.setPrototypeOf(this, NexusApiError.prototype);
  }
}

function buildQuery(query?: NexusRequestOptions['query']): string {
  if (!query) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export class NexusClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly backoffMs: number;

  constructor(opts: NexusClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.token = opts.token;
    this.headers = opts.headers ?? {};
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as typeof fetch);
    this.maxRetries = opts.maxRetries ?? 3;
    this.backoffMs = opts.backoffMs ?? 300;
    if (!this.fetchImpl) {
      throw new Error(
        'NexusClient: no fetch implementation available (pass fetchImpl for Node <18)'
      );
    }
  }

  /** Generic request. `R` is the expected `result` payload type. */
  async request<R = unknown>(options: NexusRequestOptions): Promise<R> {
    const { method = 'GET', path, body, query, signal } = options;
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}${buildQuery(query)}`;
    const headers: Record<string, string> = { 'content-type': 'application/json', ...this.headers };
    if (this.token) headers.authorization = `Bearer ${this.token}`;

    const maxRetries = options.maxRetries ?? this.maxRetries;
    let attempt = 0;
    let lastErr: unknown;

    while (attempt <= maxRetries) {
      try {
        const res = await this.fetchImpl(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal,
        });
        const text = await res.text();
        const parsed = text ? (JSON.parse(text) as NexusEnvelope<R>) : ({} as NexusEnvelope<R>);

        if (!res.ok) {
          const errBody = parsed.error ?? { code: 'HTTP_ERROR', message: res.statusText };
          throw new NexusApiError({
            code: errBody.code,
            message: errBody.message,
            status: res.status,
            requestId: parsed.requestId ?? errBody.requestId,
            traceId: errBody.traceId,
            details: errBody.details,
          });
        }
        return parsed.result as R;
      } catch (err) {
        lastErr = err;
        const status = err instanceof NexusApiError ? err.status : 0;
        const retryable = status === 429 || status >= 500 || !(err instanceof NexusApiError);
        if (!retryable || attempt >= maxRetries) break;
        const delay = this.backoffMs * 2 ** attempt + Math.floor(Math.random() * 50);
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
      }
    }
    if (lastErr instanceof NexusApiError) throw lastErr;
    throw new NexusApiError({ code: 'NETWORK_ERROR', message: String(lastErr), status: 0 });
  }

  /** Convenience REST helpers. */
  get<R = unknown>(
    path: string,
    query?: NexusRequestOptions['query'],
    opts?: Partial<NexusRequestOptions>
  ) {
    return this.request<R>({ ...opts, method: 'GET', path, query });
  }
  post<R = unknown>(path: string, body?: unknown, opts?: Partial<NexusRequestOptions>) {
    return this.request<R>({ ...opts, method: 'POST', path, body });
  }
  put<R = unknown>(path: string, body?: unknown, opts?: Partial<NexusRequestOptions>) {
    return this.request<R>({ ...opts, method: 'PUT', path, body });
  }
  del<R = unknown>(path: string, opts?: Partial<NexusRequestOptions>) {
    return this.request<R>({ ...opts, method: 'DELETE', path });
  }
}

/* ─── Typed resource clients (generic over entity shapes) ──────────────── */

export interface MarketplacePlugin {
  id: string;
  slug: string;
  name: string;
  description: string;
  authorId: string;
  authorName: string;
  category: string;
  kind: 'plugin' | 'agent' | 'memory' | 'widget' | 'tool' | 'integration';
  license: string;
  homepage?: string;
  repository?: string;
  latestVersion?: string;
  avgRating: number;
  ratingCount: number;
  installCount: number;
  status: 'draft' | 'published' | 'deprecated' | 'quarantined';
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export class MarketplaceClient<R = MarketplacePlugin> {
  constructor(private readonly client: NexusClient) {}
  list(query?: { category?: string; kind?: string; q?: string; limit?: number; offset?: number }) {
    return this.client.get<NexusPage<R>>('/api/v1/marketplace/plugins', query);
  }
  get(slug: string) {
    return this.client.get<R & { versions: unknown[] }>(
      `/api/v1/marketplace/plugins/${encodeURIComponent(slug)}`
    );
  }
  publish(input: {
    slug: string;
    name: string;
    description?: string;
    category?: string;
    kind?: R extends { kind: infer K } ? K : string;
  }) {
    return this.client.post<{ id: string; slug: string }>('/api/v1/marketplace/plugins', input);
  }
  install(slug: string, input: { versionId?: string; tenantId?: string; installPath?: string }) {
    return this.client.post<{ id: string; receipt: string }>(
      `/api/v1/marketplace/plugins/${encodeURIComponent(slug)}/install`,
      input
    );
  }
  review(
    slug: string,
    input: { versionId?: string; rating: number; title?: string; body?: string }
  ) {
    return this.client.post<{ id: string; rating: number }>(
      `/api/v1/marketplace/plugins/${encodeURIComponent(slug)}/reviews`,
      input
    );
  }
}

export interface NexusClientResources {
  marketplace: MarketplaceClient;
}

/** Attach typed resource sub-clients. Extend this with more resources. */
export function withResources(client: NexusClient): NexusClient & NexusClientResources {
  const c = client as NexusClient & NexusClientResources;
  c.marketplace = new MarketplaceClient(client as NexusClient);
  return c;
}

export function createClient(opts: NexusClientOptions): NexusClient & NexusClientResources {
  return withResources(new NexusClient(opts));
}
