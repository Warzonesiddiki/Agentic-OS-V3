# ADR-0030: Future Roadmap (post-Phase-20)

- Status: Accepted (direction ratified; items tracked as gaps)
- Date: 2026-07-09
- Deciders: Leader, all phase owners, Lorekeeper

## Context

Phases 11–20 are COMPLETE (task board + compile gate certified 0). The OS now has
advanced kernel/scheduling, memory, orchestration, security, perf, DX/SDK,
enterprise, self-optimization, marketplace/WASM, and chaos/reliability. What comes
next must build on the ratified seams (kernel `enqueueTask`, Pulse live setters,
Sentinel guardrails, Aegis audit chain) without breaking the exclusive-namespace
contract or the ADR-0011 gate discipline.

## Decision

The post-Phase-20 roadmap (tracked as ADR-0031+ gaps, owned per `AGENTS.md`):

- **Voice UI (ADR-0016):** implement `voice.service.ts` as an edge adapter (STT→
  text→existing path, TTS via `llm-gateway-v2.ts` SSE); register `voice:use`
  capability. Design ratified, impl pending.
- **Edge / offline runtime:** lightweight kernel build for on-device agents,
  reusing `crates/` Rust where the TS↔Rust boundary is eventually bridged (still
  decoupled per ADR-0007 today).
- **Federated learning:** extend `federated-recall.ts` (ADR-0012) + `p2p-swarm`
  into cross-node model/ranking sync (`ranking-trainer.ts` federation).
- **Advanced A2A:** richer signed RPC semantics (ADR-0013) — capability delegation,
  quorum signing for consensus paths.
- **Self-optimization ACTIVE mode:** flip the harness (ADR-0014) from ADVISORY to
  operator-approved ACTIVE once guardrail confidence clears the safe band.
- **Marketplace GA:** open the WASM plugin marketplace (ADR-0017/0019) to third
  parties with billing (Phase 17) wired end-to-end.
- **Governance:** keep the autonomous loop (ML-001/002/003) + hash-chained audit
  (ADR-0023) as the invariant; every new capability appends an ADR in this series.

## Consequences

- The roadmap is explicit about building ONLY on ratified seams — no rewrite, no
  namespace collision risk.
- Voice UI is the nearest-term gap (design done, impl tracked).
- All future decisions continue the ADR series (0031+) so the architecture record
  stays contiguous and auditable.
- Operational note: no roadmap item may merge without the ADR-0011 fresh gate = 0
  and Quill's validate gate green.
