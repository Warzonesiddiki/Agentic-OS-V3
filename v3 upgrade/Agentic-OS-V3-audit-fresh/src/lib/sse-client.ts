/**
 * sse-client.ts — Server-Sent Events client for live agent state streaming.
 *
 * Connects to the NEXUS server's /api/v1/events endpoint and dispatches
 * real-time events (agent state changes, task updates, approval requests)
 * to subscribed React components via useSyncExternalStore.
 */

export interface SSEEvent {
  type: "connected" | "agent.state" | "task.update" | "approval.requested" | "audit.appended" | "cron.fired";
  data: unknown;
  timestamp: number;
}

/** Subscribers are simple () => void callbacks for useSyncExternalStore. */
type Subscriber = () => void;

let _es: EventSource | null = null;
const subscribers = new Set<Subscriber>();
let _events: SSEEvent[] = [];
let _connected = false;
const MAX_EVENTS = 100;

/** Get recent events (stable snapshot for useSyncExternalStore). */
export function getEvents(): SSEEvent[] {
  return _events;
}

/** Whether the SSE connection is active. */
export function isConnected(): boolean {
  return _connected;
}

/** Subscribe to SSE updates. Returns an unsubscribe function. */
export function subscribeSSE(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function emit(event: SSEEvent): void {
  _events = [..._events.slice(-MAX_EVENTS + 1), event];
  for (const fn of subscribers) fn();
}

/** Connect to the server's SSE endpoint. */
export async function connectSSE(baseUrl: string, apiKey: string): Promise<void> {
  if (_es) _es.close();

  // Exchange API key for a short-lived SSE token (60s TTL, never exposes the raw key)
  let token = "";
  try {
    const res = await fetch(`${baseUrl}/api/v1/events/token`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: { token?: string } };
      token = data?.data?.token ?? "";
    }
  } catch {
    // Token exchange failed — try without auth
  }

  const url = token
    ? `${baseUrl}/api/v1/events?token=${encodeURIComponent(token)}`
    : `${baseUrl}/api/v1/events`;

  try {
    _es = new EventSource(url);

    _es.onopen = () => {
      _connected = true;
      emit({ type: "connected", data: { status: "connected" }, timestamp: Date.now() });
    };

    _es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as SSEEvent;
        emit(event);
      } catch {
        // Non-JSON message — ignore
      }
    };

    _es.onerror = () => {
      _connected = false;
      // Auto-reconnect is built into EventSource — it will retry.
      // Refresh the token on reconnect if we have an API key
      if (apiKey && !token) {
        connectSSE(baseUrl, apiKey);
      }
    };
  } catch {
    // EventSource not available (SSR / non-browser) — silent fallback.
    _connected = false;
  }
}

/** Disconnect from the SSE endpoint. */
export function disconnectSSE(): void {
  if (_es) {
    _es.close();
    _es = null;
  }
  _connected = false;
}

/** Get the latest agent states from the event stream. */
export function getLatestAgentStates(): Record<string, unknown> {
  const states: Record<string, unknown> = {};
  for (const e of _events) {
    if (e.type === "agent.state" && e.data && typeof e.data === "object" && "id" in e.data) {
      states[(e.data as { id: string }).id] = e.data;
    }
  }
  return states;
}
