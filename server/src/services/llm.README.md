# llm

## Purpose
Low-level LLM client. Thin wrapper over the OpenAI-compatible chat-completions endpoint configured via env
(`NEXUS_LLM_BASE_URL` / `NEXUS_LLM_API_KEY` / `NEXUS_LLM_MODEL`). Supports chat, streaming, structured
(json-schema) extraction, transcript distillation, and agent chat. (Cerebrum area.)

## Public exports (selected)
- `interface LLMMessage`, `interface LLMRequest`, `interface LLMResponse`.
- `interface DistilledMemory`.
- `async function callLLM(req): Promise<LLMResponse>`.
- `type StreamChunkCallback`, `async function callLLMStream(req, cb)`.
- `async function callLLMStructured<T>(req): Promise<T>`.
- `async function distillTranscript(transcript): Promise<DistilledMemory[]>`.
- `async function agentChat(...)`.

## Env vars
- `NEXUS_LLM_PROVIDER`, `NEXUS_LLM_BASE_URL`, `NEXUS_LLM_API_KEY`, `NEXUS_LLM_MODEL`.

## Test file
- `server/tests/llm.test.ts` (callLLM mock, structured, stream).
