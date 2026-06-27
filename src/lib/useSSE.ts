/**
 * useSSE — React hook for consuming Server-Sent Events from the NEXUS server.
 *
 * Uses useSyncExternalStore for tear-free rendering. When the server pushes
 * an agent state change, task update, or approval request, all subscribed
 * components re-render instantly.
 */
import { useSyncExternalStore, useMemo } from "react";
import { subscribeSSE, getEvents, isConnected, connectSSE, disconnectSSE, type SSEEvent } from "./sse-client";
import { useEffect } from "react";
import { getRemote } from "./remote";

/** Hook that returns the latest SSE events and connection status. */
export function useSSE(): { events: SSEEvent[]; connected: boolean } {
  const events = useSyncExternalStore(subscribeSSE, getEvents, getEvents);
  const connected = useSyncExternalStore(
    (fn) => subscribeSSE(fn),
    isConnected,
    isConnected,
  );

  // Auto-connect when remote is enabled
  useEffect(() => {
    const remote = getRemote();
    if (remote.enabled && remote.baseUrl && remote.apiKey) {
      connectSSE(remote.baseUrl, remote.apiKey);
    }
    return () => disconnectSSE();
  }, []);

  return { events, connected };
}

/** Hook that returns only the latest agent state changes. Memoized to avoid new object references on every render. */
export function useAgentStates(): Record<string, unknown> {
  const { events } = useSSE();
  return useMemo(() => {
    const states: Record<string, unknown> = {};
    for (const e of events) {
      if (e.type === "agent.state" && e.data && typeof e.data === "object" && "id" in e.data) {
        states[(e.data as { id: string }).id] = e.data;
      }
    }
    return states;
  }, [events]);
}

/** Hook that returns pending approval requests. Memoized to avoid new array references on every render. */
export function useApprovals(): SSEEvent[] {
  const { events } = useSSE();
  return useMemo(() => events.filter((e) => e.type === "approval.requested"), [events]);
}
