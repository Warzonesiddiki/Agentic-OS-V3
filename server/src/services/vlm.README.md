# vlm

## Purpose
Vision-language-model client + desktop-action parser. `vlmConfigured()` reports whether a VLM endpoint is
set; `callVLM(req)` runs image+prompt inference; `parseDesktopActions(resp)` extracts structured
`DesktopAction[]` for the desktop actuator. (Cerebrum area.)

## Public exports (selected)
- `function vlmConfigured(): boolean`.
- `interface VLMRequest`, `interface VLMResponse`.
- `async function callVLM(req): Promise<VLMResponse>`.
- `interface DesktopAction`, `function parseDesktopActions(vlmResponse: string): DesktopAction[]`.

## Env vars
- `NEXUS_LLM_BASE_URL`, `NEXUS_LLM_API_KEY`, `NEXUS_LLM_MODEL` (VLM endpoint reuses the LLM env).

## Test file
- `server/tests/vlm.test.ts` (vlmConfigured, callVLM mock, parseDesktopActions).
