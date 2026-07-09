# ADR-0016: Voice UI (Speech In / Speech Out)

- Status: Accepted (design ratified; implementation pending)
- Date: 2026-07-09
- Deciders: Prism (owner), Cerebrum, Leader
- Supersedes: — (new capability)

## Context

Operators asked for hands-free interaction with the OS — dictate tasks, hear
agent status. The backend already exposes everything needed through the LLM
gateway streaming seam (`server/src/services/llm-gateway-v2.ts`,
`brain.ts`) and the dashboard already renders a console (Prism). What is missing
is a **speech I/O boundary** that converts audio ↔ text at the edges and feeds the
existing text pipeline unchanged.

> Note: as of this ADR there is **no dedicated `voice*` module** in
> `server/src/services`. Session capture (`session-recorder.ts`,
> `session.service.ts`) records text transcripts only. This ADR ratifies the
> design and the integration seam so the voice module can land without disturbing
> the core.

## Decision

Voice is an **edge adapter**, not a core subsystem:

- **Speech-to-Text (STT):** a thin `voice.service.ts` (to be added under Artisan's
  namespace per the ownership map — skills/plugins) calls an external STT provider
  through the same `ProviderAdapter` interface Cerebrum uses for LLMs, then feeds
  the transcript into the existing text request path (`/api/v1/...` console input).
- **Text-to-Speech (TTS):** the dashboard (Prism) requests TTS for agent responses;
  an audio stream is returned via the LLM gateway's streaming response, reusing
  `llm-gateway-v2.ts` SSE framing.
- **No new memory/recall changes:** spoken input is just text once transcribed, so
  Mnemosyne's recall and the federated-recall layer are untouched.
- **Capability gating:** voice capture requires the `voice:use` capability
  (Sentinel), and transcripts are written to the normal session store (Aegis
  audit, PII/DLP scan via `dlp-scanner.ts`).

## Consequences

- Voice slots in as an I/O adapter with zero changes to kernel/scheduler/memory —
  the lowest-risk possible integration.
- STT/TTS provider choice is pluggable via the gateway's `ProviderAdapter`, so
  Whisper / cloud TTS can be swapped without touching call sites.
- Pending: actual `voice.service.ts` implementation, dashboard mic/canvas wiring,
  and `voice:use` capability registration. Tracked as a Phase-21 gap item.
- Until implemented, the documented seam ensures the feature cannot destabilize
  the certified compile gate.
