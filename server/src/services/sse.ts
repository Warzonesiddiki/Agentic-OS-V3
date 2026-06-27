/**
 * services/sse.ts — Server-Sent Events for live agent state streaming.
 *
 * Maintains a set of active SSE "writers" (functions that push data to a
 * client stream) and broadcasts agent state changes, task updates, and
 * approval requests in real-time to the React Dashboard Kanban board.
 *
 * NOTE: This module intentionally does NOT depend on Node's ServerResponse
 * type. It uses a minimal Writer interface (just `write` + `close`) so it
 * works cleanly with both raw Node http and Web ReadableStream responses.
 */

export type SSEWriter = {
  write: (chunk: string) => void;
  close: () => void;
};

export interface SSEEvent {
  type: "connected" | "agent.state" | "task.update" | "approval.requested" | "audit.appended" | "cron.fired";
  data: unknown;
  timestamp: number;
}

const clients = new Set<SSEWriter>();

/** Register a new SSE client connection. Returns a cleanup function. */
export function addSSEClient(writer: SSEWriter): () => void {
  writer.write(`data: ${JSON.stringify({ type: "connected", timestamp: Date.now() })}\n\n`);
  clients.add(writer);
  return () => {
    clients.delete(writer);
    try { writer.close(); } catch { /* already closed */ }
  };
}

/** Broadcast an event to all connected SSE clients. */
export function broadcastSSE(event: SSEEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

/** Get the count of active SSE connections. */
export function getSSEClientCount(): number {
  return clients.size;
}
