# 🧠 NEXUS 2.0 — Memory Architecture

**Author:** Mnemosyne | **Status:** v1.0

---

## 1. Memory Tiers

| Tier | Scope | TTL | Description |
|---|---|---|---|
| **Working** | per-agent | Per-turn (auto-purge at turn boundary) | Short-term scratchpad. RAM-resident, not persisted. |
| **Episodic** | per-agent, per-team | Sessions / days (rolling window, LRU) | Append-only event log. Surfaces past context to agents. |
| **Semantic** | per-agent, per-team, global | Indefinite (gc-triggered) | Vector-embedded knowledge. Primary long-term memory. |
| **Procedural** | global | Skill-versioned | Skill definitions, toolchains, agent capabilities. Graph-structured. |

---

## 2. Storage Backends

| Tier | Recommended Backend | Rationale |
|---|---|---|
| Working | In-memory KV (`dict` / `mmap`) | Sub-ms latency; no persistence needed; turn boundary is the flush point. |
| Episodic | **SQLite** (append-only mode) | Lightweight, durable, queryable without a server process. Easier migration than raw log files. |
| Semantic | **Qdrant** (default) / pgvector fallback | Hybrid dense+sparse retrieval, MMR, re-ranking, and filtered queries built-in. pgvector chosen if Postgres is already in the stack. |
| Procedural | **Neo4j** or **Memgraph** (property graph) | Multi-hop traversal for skill resolution (e.g., "find all agents with skill X and permission Y in 2 hops"). |

---

## 3. Memory Scopes & Permission Model

```
Scope hierarchy (narrowest → widest):
  turn → agent → team → global

Permissions:
  turn    : owner read/write only
  agent   : owner read/write only
  team    : all team members read; team lead + owner write
  global  : all agents read; Leader + Atlas co-sign on write

Enforcement: every memory.write() call checks agent_id × scope → permission.
Schema changes to global memory require Atlas sign-off.
```

---

## 4. Retrieval Patterns

1. **Hybrid dense + sparse** — Qdrant `dense_weight=0.7, sparse_weight=0.3` default; tunable per query.
2. **MMR (Maximal Marginal Relevance)** — enabled for open-ended / exploration queries to prevent redundant results.
3. **Re-ranking** — bi-encoder retrieval → cross-encoder (`sentence-transformers CrossEncoder`) re-rank for precision.
4. **HyDE (Hypothetical Document Embeddings)** — for ambiguous/abSTRACT queries; generate hypothetical answer, embed it, retrieve real matches.
5. **Multi-hop graph traversal** — for procedural queries; 2–3 hops max to bound latency.

---

## 5. Memory Hygiene

| Concern | Strategy |
|---|---|
| **Decay** | Working: TTL-based purge at turn boundary. Episodic: LRU with `max_episodes=1000` per agent; oldest trimmed first. |
| **Summarization** | Episodic entries older than 48 h → `memory.summarize(agent_id)` → compressed into a semantic chunk; original archived. |
| **Deduplication** | Content hash (`sha256`) checked at write time; duplicate writes skipped. |
| **Conflict resolution** | Working/Episodic: last-write-wins. Semantic: cosine similarity threshold (`> 0.95`) triggers merge-or-flag decision. |
| **Poisoning defense** | All writes pass through a validation layer: schema check + embedding z-score anomaly detection (|z| > 3 → quarantine + Sentinel alert). |

---

## 6. Interface Contracts

```python
from typing import Literal
from dataclasses import dataclass

Scope = Literal["turn", "agent", "team", "global"]

@dataclass
class MemoryItem:
    id: str
    scope: Scope
    owner: str          # agent_id
    content: str
    embedding: list[float] | None
    provenance: str     # "write" | "import" | "summarize"
    created_at: float  # unix timestamp
    expires_at: float | None


class MemoryInterface:
    def read(
        self,
        scope: Scope,
        query: str,
        agent_id: str,
        top_k: int = 10,
        filters: dict | None = None,
    ) -> list[MemoryItem]:
        """Hybrid retrieval: dense+sparse → optional re-rank → top_k."""

    def write(
        self,
        scope: Scope,
        owner: str,
        content: str,
        metadata: dict | None = None,
    ) -> MemoryItem:
        """Write with dedup, hash check, and provenance. Returns stored item."""

    def delete(self, item_id: str, agent_id: str) -> bool:
        """Owner-only deletion. Returns True if deleted."""

    def list(
        self,
        scope: Scope,
        agent_id: str,
        limit: int = 100,
    ) -> list[MemoryItem]:
        """List items in scope for owner (or team/global with read permission)."""

    def summarize(self, agent_id: str, older_than_hours: int = 48) -> int:
        """Summarizes episodic entries older than threshold. Returns count compressed."""

    def gc(self) -> dict[str, int]:
        """Garbage collect expired entries across all tiers. Returns counts removed."""

    def stats(self, scope: Scope, agent_id: str) -> dict:
        """Returns {"count", "avg_retention_days", "last_write_ts"} for scope."""
```

---

## Open Questions

1. **Qdrant hosting model** — managed cloud vs. self-hosted (Bastion)? Affects auth and connection pooling design.
2. **Episodic format** — SQLite vs. append-only log? SQLite wins on queryability; log wins on simplicity. Need Pulse's runtime loop input.
3. **Global memory schema** — blocked on Atlas's `MASTER_SPEC §3` before the `global` scope contract can be finalized.