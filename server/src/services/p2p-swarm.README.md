# p2p-swarm

## Purpose
Libp2p-based peer-to-peer swarm for federated audit-root broadcasting and mesh messaging. Exposes enable/run
state, peer listing, publish/subscribe, and audit-root broadcast. Events: `peer:found`, `peer:lost`,
`message`. (Helix area.)

## Public exports (selected)
- `interface PeerInfo`, `interface P2PMessage`.
- `const p2pEvents: EventEmitter`.
- `P2P_EVENT_PEER_FOUND` / `P2P_EVENT_PEER_LOST` / `P2P_EVENT_MESSAGE`.
- `function isP2PEnabled(): boolean`, `isP2PRunning(): boolean`.
- `function getPeers(): PeerInfo[]`, `getMyId(): string`.
- `async function startP2PNode(): Promise<void>`, `stopP2PNode(): Promise<void>`.
- `async function publish(topic, data): Promise<void>`.
- `async function broadcastAuditRoot(root, checkpointId): Promise<void>`.
- `function getPeerListHandler()`, `receiveMessageHandler(body)`.

## Env vars
- `NEXUS_BLOCKCHAIN_RPC_URL` (used as libp2p bootstrap url), `NEXUS_P2P_ENABLED`.

## Test file
- `server/tests/p2p-swarm.test.ts` (enable/start/stop, publish, peer handler).
