/**
 * server/src/services/unified-gateway/portkey/index.ts
 * Portkey Multi-Provider Gateway entrypoint and supported model catalog.
 */

export * from './types.js';
export * from './client.js';

/**
 * Standard catalog of supported models across OpenAI, Anthropic, Gemini/Google, Groq, Mistral, Azure, and Cohere.
 * Over 150+ models supported via Portkey unified gateway routing.
 */
export const PORTKEY_SUPPORTED_MODELS: Record<string, string[]> = {
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'o1',
    'o1-mini',
    'o3-mini',
    'text-embedding-3-small',
    'text-embedding-3-large',
  ],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ],
  google: [
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-1.0-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'llama-3.1-70b-versatile',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
  ],
  mistral: [
    'mistral-large-latest',
    'mistral-small-latest',
    'codestral-latest',
    'pixtral-12b-2409',
    'open-mixtral-8x22b',
  ],
  azure: ['azure-gpt-4o', 'azure-gpt-4o-mini', 'azure-gpt-4-turbo'],
  cohere: ['command-r-plus', 'command-r', 'embed-english-v3.0', 'embed-multilingual-v3.0'],
};

export function getAllSupportedPortkeyModels(): string[] {
  return Object.values(PORTKEY_SUPPORTED_MODELS).flat();
}
