import { log } from "../lib/logging.js";

interface SSEWriter { write(chunk: string): void; close(): void; }

const clients = new Set<SSEWriter>();

export function addSSEClient(writer: SSEWriter): () => void {
  clients.add(writer);
  return () => { clients.delete(writer); };
}

export function getSSEClientCount(): number {
  return clients.size;
}

export function broadcastSSE(event: { type: string; data: unknown; timestamp: number }): void {
  const msg = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  for (const w of clients) {
    try { w.write(msg); } catch { clients.delete(w); }
  }
}
