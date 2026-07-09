# portkey-bridge

## Purpose
Portkey.ai unified-gateway provider adapters. Maps a NEXUS `ProviderRequest` into Portkey format
(`toPortkeyRequest`) and provides ready-made `ProviderAdapter` implementations for OpenAI, Anthropic,
Gemini, Groq, Mistral, and Azure. `streamPortkeyBridge` streams; `dispatchMultiProvider` fans out across
providers. (Cerebrum area.)

## Public exports (selected)
- `interface PortkeyBridgeOptions`, `function toPortkeyRequest(req, providerOverride?)`.
- `const portkeyBridge: ProviderAdapter` (default).
- `const portkeyOpenAIProvider`, `portkeyAnthropicProvider`, `portkeyGeminiProvider`,
  `portkeyGroqProvider`, `portkeyMistralProvider`, `portkeyAzureProvider`.
- `function streamPortkeyBridge(req, headers?)`.
- `async function dispatchMultiProvider(req, providers[]): Promise<ProviderResponse>`.

## Env vars
Reads `PORTKEY_API_KEY` + provider keys via env (delegated to the gateway).

## Test file
- `server/tests/portkey-bridge.test.ts` (toPortkeyRequest mapping, adapter call/stream).
