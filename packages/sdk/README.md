# @agentic-os/sdk

Official **TypeScript SDK** for the NEXUS Agentic OS API (Phase 16 — Developer Experience & SDK).

- Fully typed client with generics
- ESM **and** CJS builds (`import`/`require`)
- Automatic retry/backoff on `429`/`5xx`
- Cursor/offset pagination helpers
- HMAC-SHA256 **webhook** verification
- Human-readable **error** mapping with remediation hints

## Install

```bash
npm i @agentic-os/sdk
# or
pnpm add @agentic-os/sdk
```

## Quick start

```ts
import { createClient } from '@agentic-os/sdk';

const nexus = createClient({
  baseUrl: process.env.NEXUS_URL ?? 'http://localhost:8787',
  token: process.env.NEXUS_TOKEN,
});

// List published plugins
const page = await nexus.marketplace.list({ category: 'memory', limit: 20 });
console.log(page.items.map((p) => p.slug));

// Install a plugin (resolves dependencies + returns a receipt)
const { receipt } = await nexus.marketplace.install('recall-boost', { tenantId: 'acme' });
```

## Webhooks

```ts
import { parseVerifiedWebhook } from '@agentic-os/sdk';

// In your webhook handler (Express/Hono/Fastify):
app.post('/nexus/webhook', (req, res) => {
  const event = parseVerifiedWebhook<{ slug: string; version: string }>({
    secret: process.env.NEXUS_WEBHOOK_SECRET!,
    payload: req.rawBody,
    signature: req.headers['x-nexus-signature'],
  });
  // …handle event
});
```

## Error handling

```ts
import { toHumanReadableError, formatError } from '@agentic-os/sdk';

try {
  await nexus.marketplace.install('x', {});
} catch (e) {
  console.error(formatError(e));
  // ✖ [DEPENDENCY_CYCLE] …
  //   → The plugin dependency graph contains a cycle…
}
```

## Build

```bash
pnpm --filter @agentic-os/sdk build   # emits dist/esm + dist/cjs + .d.ts
pnpm --filter @agentic-os/sdk test    # vitest
```

See `../../docs/phase-16-devx.md` for the full Phase 16 spec.
