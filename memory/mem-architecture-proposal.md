# 🧠 NEXUS 2.0 — Memory Architecture Proposal v1
**Author:** Mnemosyne | **Status:** Draft (pending Atlas MASTER_SPEC §3)

---

## 1. Memory Tiers & Confirmed Scopes

| Tier | TTL | Scope | Volatility |
|---|---|---|---|
| **Working** | Per-turn (auto-purge at turn boundary) | per-agent | RAM |
| **Episodic** | Sessions / days (rolling window) | per-agent, per-team | Persistent append-log |
| **Semantic** | Long-term (indefinite, gc-triggered) | per-agent, per-team, global | Vector DB |
| **Procedural** | Long-term (skill versioned) | global | Graph DB + code store |

---

## 2. Storage Backend Defaults

| Tier | Primary | Rationale |
|---|---|---|
| Working | In-memory KV (`dict` / `mmap` file) | Sub-ms latency, turn-boundary flush |
| Episodic | SQLite or Append-only KV log | Durable, queryable, lightweight |
| Semantic | **Qdrant** (default) or pgvector fallback | Hybrid dense+sparse, MMR, re-ranking built-in |
| Procedural | Neo4j / Memgraph (property graph) | Multi-hop traversal for skill resolution |

---

## 3. Memory Scopes & Permission Model

```
scope hierarchy:
  global  (system-wide, read: all agents, write: Leader + Atlas co-sign)
  team    (team-shared,  read: team members, write: team lead + owner)
  agent   (per-agent,    read: owner only,   write: owner only)
  turn    (per-turn,     read: owner only,   write: owner only)
```

- **Enforcement:** Every `memory.write` call checks `agent_id × scope → permission`.
- **Global writes** require Atlas co-sign (schema contract).
- **Team scope** inherits team role permissions (Leader, teammate).

---

## 4. Retrieval Patterns

1. **Hybrid dense + sparse** — Qdrant `dense_weight=0.7 / sparse_weight=0.3` default; tunable per query.
2. **MMR (Maximal Marginal Relevance)** — enabled for open-ended exploration queries to avoid redundancy.
3. **Re-ranking** — bi-encoder score → cross-encoder re-rank (`CrossEncoder` from `sentence-transformers`).
4. **HyDE (Hypothetical Document Embeddings)** — for abstract/ambiguous queries; generate hypothetical answer → embed → retrieve real matches.
5. **Multi-hop graph traversal** — for procedural / knowledge-graph queries (2-3 hops max to avoid latency blowup).

---

## 5. Memory Hygiene

| Concern | Strategy |
|---|---|
| **Decay** | Working tier: TTL-based purge. Episodic: LRU with `max_episodes=1000` per agent. |
| **Summarization** | Compress episodic entries > 48h old via `memory.summarize(agent_id)` → store as semantic chunk. |
| **Dedup** | Dedupe by content hash at write time (`sha256(content) → skip if exists`). |
| **Conflict resolution** | Last-write-wins for working/episodic; semantic uses vector distance threshold (`cosine > 0.95` → merge or flag). |
| **Poisoning (Sentinel)** | All writes go through validation: schema check + embedding anomaly detection (z-score > 3 → quarantine + alert). |

---

## 6. Core Interface (Pulse-facing type signatures)

```python
from typing import Literal, Any
from dataclasses import dataclass

Scope = Literal["turn", "agent", "team", "global"]

@dataclass
class MemoryItem:
    id: str          # uuid
    scope: Scope
    owner: str       # agent_id
    content: str
    embedding: list[float] | None
    provenance: str  # "write" | "import" | "summarize"
    created_at: float
    expires_at: float | None

class MemoryInterface:
    # Read
    def read(self, scope: Scope, query: str, agent_id: str,
             top_k: int = 10, filters: dict | None = None) -> list[MemoryItem]:
        ...

    # Write
    def write(self, scope: Scope, owner: str, content: str,
              metadata: dict | None = None) -> MemoryItem:
        ...

    # Delete
    def delete(self, item_id: str, agent_id: str) -> bool:
        ...

    # Management
    def summarize(self, agent_id: str, older_than_hours: int = 48) -> int:
        """Returns count of episodes summarized."""

    def gc(self) -> dict[str, int]:  # items removed per tier
        ...

    def stats(self, scope: Scope, agent_id: str) -> dict:
        """Returns count, avg_retention_days, last_write."""
```

---

## Open Questions / Blockers

- [ ] Will Qdrant be hosted (Bastion) or client-side SDK? Affects auth layer.
- [ ] Episodic storage format — append-only log vs. SQLite? Need Pulse confirmation.
- [ ] **BLOCKED:** Global memory schema — need Atlas's `MASTER_SPEC §3` before finalizing `global` scope contract.
- [ ] Lorekeeper's per-agent memory seed profiles pending — will inform per-agent memory initialization.

---

*Proposal ready to iterate. Standing by for Atlas's MASTER_SPEC §3.*