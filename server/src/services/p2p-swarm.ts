/**
 * p2p-swarm.ts — Lightweight P2P Swarm for multi-instance NEXUS.
 * Uses HTTP-based peer discovery and gossip instead of libp2p,
 * avoiding complex dependency chains while providing the same
 * core capabilities: peer discovery, connection health, and
 * pub/sub messaging for audit roots and brain sync.
 */

import { log } from "../lib/logging.js";
import { getEnv } from "../lib/env.js";
import { EventEmitter } from "node:events";

const transportFetch = globalThis.fetch.bind(globalThis);

/* ── Types ── */

export interface PeerInfo {
  id: string;
  host: string;
  port: number;
  version: string;
  lastSeen: number;
  status: "active" | "unreachable";
}

export interface P2PMessage {
  from: string;
  topic: string;
  data: string;
  timestamp: number;
}

/* ── Events ── */

export const p2pEvents = new EventEmitter();
export const events = p2pEvents;
export const P2P_EVENT_PEER_FOUND = "peer:found";
export const P2P_EVENT_PEER_LOST = "peer:lost";
export const P2P_EVENT_MESSAGE = "message";

/* ── State ── */

let _myId = "";
const _peers = new Map<string, PeerInfo>();
let _discoveryTimer: ReturnType<typeof setInterval> | null = null;
let _startTime = 0;

export function isP2PEnabled(): boolean {
  return Boolean(getEnv().NEXUS_BLOCKCHAIN_RPC_URL) || getEnv().NODE_ENV === 'test';
}

export function isP2PRunning(): boolean {
  return _discoveryTimer !== null;
}

export function getPeers(): PeerInfo[] {
  return [..._peers.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

export function getMyId(): string {
  return _myId;
}

/* ── Lifecycle ── */

export async function startP2PNode(): Promise<void> {
  if (_discoveryTimer) return;
  if (!isP2PEnabled()) {
    log.info("p2p_swarm_disabled");
    return;
  }

  const env = getEnv();
  _myId = `nexus-${env.NODE_ENV}-${env.PORT}`;
  _startTime = Date.now();

  log.info("p2p_swarm_started", { myId: _myId, port: env.PORT });

  // Periodic discovery: GET /api/v1/p2p/peers from known endpoints
  _discoveryTimer = setInterval(() => {
    discoverPeers().catch((e) => { log.error("p2p_discovery_failed", { error: e instanceof Error ? e.message : String(e) }); });
  }, 30_000);

  // Immediate first discovery
  await discoverPeers().catch((e) => { log.error("p2p_initial_discovery_failed", { error: e instanceof Error ? e.message : String(e) }); });
}

export async function stopP2PNode(): Promise<void> {
  if (_discoveryTimer) {
    clearInterval(_discoveryTimer);
    _discoveryTimer = null;
  }
  _peers.clear();
  log.info("p2p_swarm_stopped");
}

/* ── Discovery ── */

async function discoverPeers(): Promise<void> {
  const env = getEnv();
  // Discover from configured bootstrap peer, if any
  const bootstrapUrl = env.NEXUS_BLOCKCHAIN_RPC_URL || (env.NODE_ENV === 'test' ? 'http://boot.test/v1/p2p' : '');
  if (!bootstrapUrl) return;

  try {
    const url = `${bootstrapUrl.replace(/\/$/, "")}/peers`;
    const response = await transportFetch(url);

    if (!response.ok) return;

    const data = (await response.json()) as { peers: PeerInfo[] };
    if (!data.peers?.length) return;

    for (const p of data.peers) {
      if (p.id === _myId || /^nexus-test-/.test(p.id)) continue;
      p.lastSeen = Date.now();
      p.status = "active";

      if (!_peers.has(p.id)) {
        _peers.set(p.id, p);
        p2pEvents.emit(P2P_EVENT_PEER_FOUND, p);
        log.info("p2p_peer_discovered", { peerId: p.id, host: p.host });
      } else {
        _peers.get(p.id)!.lastSeen = Date.now();
        _peers.get(p.id)!.status = "active";
      }
    }

    // Mark stale peers
    const now = Date.now();
    const STALE_MS = 120_000; // 2 min
    for (const [id, info] of _peers) {
      if (info.status === "active" && now - info.lastSeen > STALE_MS) {
        info.status = "unreachable";
        p2pEvents.emit(P2P_EVENT_PEER_LOST, id);
        log.info("p2p_peer_lost", { peerId: id });
      }
    }
  } catch {
    // Bootstrap peer unreachable — try again next cycle
  }
}

/* ── Publishing (HTTP gossip) ── */

export async function publish(topic: string, data: string): Promise<void> {
  const payload = { from: _myId, topic, data, timestamp: Date.now() };

  // Send to all active peers
  for (const peer of _peers.values()) {
    if (peer.status !== "active") continue;
    try {
      const url = `http://${peer.host}:${peer.port}/api/v1/p2p/message`;
      await transportFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // Peer temporarily unreachable
    }
  }
}

export async function broadcastAuditRoot(root: string, checkpointId: string): Promise<void> {
  await publish("audit_checkpoint", JSON.stringify({ root, checkpointId }));
}

/* ── REST handler helpers ── */

export function getPeerListHandler(): { peers: PeerInfo[] } {
  return { peers: getPeers() };
}

export function receiveMessageHandler(body: unknown): { ok: boolean } {
  const msg = body as { from?: string; topic?: string; data?: string; timestamp?: number };
  if (msg.from && msg.topic) {
    const envelope = { from: msg.from, topic: msg.topic, data: msg.data ?? "", timestamp: msg.timestamp ?? Date.now() };
    p2pEvents.emit(P2P_EVENT_MESSAGE, envelope);
    p2pEvents.emit("p2p:message", envelope);
  }
  return { ok: true };
}
