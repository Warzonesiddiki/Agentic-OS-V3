/**
 * sse-client.ts — Server-Sent Events client for live agent state streaming.
 *
 * Connects to the NEXUS server's /api/v1/events endpoint and dispatches
 * real-time events (agent state changes, task updates, approval requests)
 * to subscribed React components via useSyncExternalStore.
 *
 * Self-healing design (v4):
 *  - Connection state machine: idle | connecting | connected | reconnecting | failed.
 *  - Exponential backoff with full jitter, capped, to survive server restarts
 *    and network partitions without hammering the backend.
 *  - SSE auth tokens have a short TTL (60s); a refresh timer transparently
 *    re-establishes the stream with a fresh token before expiry.
 *  - A keepalive watchdog force-reconnects if no event arrives within the
 *    expected heartbeat window, catching half-open sockets that EventSource
 *    would otherwise never notice.
 *  - Recovers instantly on `online`/visibility events.
 *  - All status mutations go through a single cached snapshot so
 *    useSyncExternalStore never sees an unstable reference.
 */

export type SSEConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface SSEEvent {
  type:
    | 'connected'
    | 'agent.state'
    | 'task.update'
    | 'approval.requested'
    | 'audit.appended'
    | 'cron.fired';
  data: unknown;
  timestamp: number;
}

export interface ConnectionStatus {
  state: SSEConnectionState;
  connected: boolean;
  retryAttempt: number;
  nextRetryAt: number;
  lastError: string | null;
  lastEventAt: number;
  lastEventSeq: number;
}

/** Subscribers are simple () => void callbacks for useSyncExternalStore. */
type Subscriber = () => void;

let _es: EventSource | null = null;
const subscribers = new Set<Subscriber>();
let _events: SSEEvent[] = [];
const MAX_EVENTS = 100;

let _state: SSEConnectionState = 'idle';
let _retryAttempt = 0;
let _nextRetryAt = 0;
let _lastError: string | null = null;
let _lastEventAt = 0;
let _lastEventSeq = 0;

let _baseUrl = '';
let _apiKey = '';
let _token = '';

let _backoffTimer: ReturnType<typeof setTimeout> | null = null;
let _tokenTimer: ReturnType<typeof setInterval> | null = null;
let _watchdogTimer: ReturnType<typeof setInterval> | null = null;

// ── Tuning constants ──
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const TOKEN_TTL_MS = 60_000;
const TOKEN_REFRESH_MS = 45_000;
const WATCHDOG_MS = 45_000;
const MAX_RETRIES = 12; // after which we surface 'failed' but still allow manual retry

let _statusSnapshot: ConnectionStatus = buildStatus();

function buildStatus(): ConnectionStatus {
  return {
    state: _state,
    connected: _state === 'connected',
    retryAttempt: _retryAttempt,
    nextRetryAt: _nextRetryAt,
    lastError: _lastError,
    lastEventAt: _lastEventAt,
    lastEventSeq: _lastEventSeq,
  };
}

function setStatus(patch: Partial<ConnectionStatus>): void {
  const prev = _statusSnapshot;
  _statusSnapshot = { ...buildStatus(), ...patch };
  void prev;
  for (const fn of subscribers) fn();
}

/** Get recent events (stable snapshot for useSyncExternalStore). */
export function getEvents(): SSEEvent[] {
  return _events;
}

/** Whether the SSE connection is currently active. */
export function isConnected(): boolean {
  return _state === 'connected';
}

/** Cached connection status snapshot (stable reference between mutations). */
export function getConnectionStatus(): ConnectionStatus {
  return _statusSnapshot;
}

/** Subscribe to SSE updates. Returns an unsubscribe function. */
export function subscribeSSE(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function emit(event: SSEEvent): void {
  _events = [..._events.slice(-MAX_EVENTS + 1), event];
  _lastEventAt = Date.now();
  if (typeof event.data === 'object' && event.data && 'sequence' in event.data) {
    const seq = (event.data as { sequence: unknown }).sequence;
    if (typeof seq === 'number') _lastEventSeq = seq;
  }
  setStatus({ lastEventAt: _lastEventAt, lastEventSeq: _lastEventSeq });
  for (const fn of subscribers) fn();
}

function clearTimers(): void {
  if (_backoffTimer) {
    clearTimeout(_backoffTimer);
    _backoffTimer = null;
  }
  if (_tokenTimer) {
    clearInterval(_tokenTimer);
    _tokenTimer = null;
  }
  if (_watchdogTimer) {
    clearInterval(_watchdogTimer);
    _watchdogTimer = null;
  }
}

function stopStream(): void {
  if (_es) {
    try {
      _es.close();
    } catch {
      /* ignore */
    }
    _es = null;
  }
}

/**
 * Exchange the API key for a short-lived SSE token (60s TTL). The raw key is
 * never placed in the stream URL. Returns "" on failure (caller may connect
 * without a token if the server allows unauthenticated local access).
 */
async function fetchToken(baseUrl: string, apiKey: string): Promise<string> {
  if (!apiKey) return '';
  try {
    const res = await fetch(`${baseUrl}/api/v1/events/token`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: { token?: string } };
      return data?.data?.token ?? '';
    }
  } catch {
    /* token exchange failed — fall through */
  }
  return '';
}

function startTokenRefresh(): void {
  if (_tokenTimer) clearInterval(_tokenTimer);
  // Refresh the token well before expiry by transparently re-opening the stream
  // with a fresh token. This is seamless to subscribers (they keep their state).
  _tokenTimer = setInterval(() => {
    if (_state !== 'connected') return;
    void openStream();
  }, TOKEN_REFRESH_MS);
}

function startWatchdog(): void {
  if (_watchdogTimer) clearInterval(_watchdogTimer);
  _watchdogTimer = setInterval(
    () => {
      if (_state !== 'connected') return;
      // No event within the watchdog window → suspect a half-open socket.
      if (Date.now() - _lastEventAt > WATCHDOG_MS) {
        _lastError = 'keepalive timeout';
        void openStream();
      }
    },
    Math.floor(WATCHDOG_MS / 3)
  );
}

/**
 * Open (or reopen) the EventSource with the current token. Idempotent: if a
 * stream is already open it is closed first so we never leak connections.
 */
async function openStream(): Promise<void> {
  stopStream();
  _token = await fetchToken(_baseUrl, _apiKey);
  const url = _token
    ? `${_baseUrl}/api/v1/events?token=${encodeURIComponent(_token)}`
    : `${_baseUrl}/api/v1/events`;

  try {
    const es = new EventSource(url);
    _es = es;

    es.onopen = () => {
      _state = 'connected';
      _retryAttempt = 0;
      _nextRetryAt = 0;
      _lastError = null;
      setStatus({ state: 'connected', retryAttempt: 0, nextRetryAt: 0, lastError: null });
      emit({ type: 'connected', data: { status: 'connected' }, timestamp: Date.now() });
      startTokenRefresh();
      startWatchdog();
    };

    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as SSEEvent;
        emit(event);
      } catch {
        // Non-JSON message — ignore
      }
    };

    es.onerror = () => {
      // EventSource is closing — prevent its native retry (which would reuse
      // the now-stale token) and drive our own backoff reconnect.
      stopStream();
      if (_state === 'connected') {
        _state = 'reconnecting';
        setStatus({ state: 'reconnecting' });
      }
      scheduleReconnect();
    };
  } catch {
    // EventSource not available (SSR / non-browser) — silent fallback.
    _state = 'failed';
    _lastError = 'EventSource unavailable';
    setStatus({ state: 'failed', lastError: 'EventSource unavailable' });
  }
}

/** Compute the next backoff delay (exponential with full jitter, capped). */
function nextBackoff(attempt: number): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.floor(Math.random() * exp);
}

function scheduleReconnect(): void {
  if (_backoffTimer) return; // already scheduled
  if (_retryAttempt >= MAX_RETRIES) {
    _state = 'failed';
    _lastError = 'max retries exceeded';
    setStatus({ state: 'failed', lastError: 'max retries exceeded' });
    return;
  }
  const delay = nextBackoff(_retryAttempt);
  _retryAttempt += 1;
  _nextRetryAt = Date.now() + delay;
  setStatus({ state: 'reconnecting', retryAttempt: _retryAttempt, nextRetryAt: _nextRetryAt });
  _backoffTimer = setTimeout(() => {
    _backoffTimer = null;
    void openStream();
  }, delay);
}

/** Connect to the server's SSE endpoint (idempotent — safe to call repeatedly). */
export async function connectSSE(baseUrl: string, apiKey: string): Promise<void> {
  clearTimers();
  _baseUrl = baseUrl;
  _apiKey = apiKey;
  _retryAttempt = 0;
  _state = 'connecting';
  setStatus({ state: 'connecting', retryAttempt: 0, lastError: null });

  // Recover instantly when the browser regains connectivity.
  if (typeof window !== 'undefined' && 'ononline' in window) {
    window.removeEventListener('online', handleOnline);
    window.addEventListener('online', handleOnline);
  }

  await openStream();
}

function handleOnline(): void {
  if (_state === 'connected' || _state === 'connecting') return;
  void connectSSE(_baseUrl, _apiKey);
}

/** Disconnect from the SSE endpoint and stop all self-healing timers. */
export function disconnectSSE(): void {
  clearTimers();
  stopStream();
  if (typeof window !== 'undefined') window.removeEventListener('online', handleOnline);
  _state = 'idle';
  _retryAttempt = 0;
  _nextRetryAt = 0;
  _lastError = null;
  setStatus({ state: 'idle', retryAttempt: 0, nextRetryAt: 0, lastError: null });
}

/** Get the latest agent states from the event stream. */
export function getLatestAgentStates(): Record<string, unknown> {
  const states: Record<string, unknown> = {};
  for (const e of _events) {
    if (e.type === 'agent.state' && e.data && typeof e.data === 'object' && 'id' in e.data) {
      states[(e.data as { id: string }).id] = e.data;
    }
  }
  return states;
}
