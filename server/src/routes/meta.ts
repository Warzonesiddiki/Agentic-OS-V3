/**
 * Phase 16 / 19 — API metadata & developer surface.
 * Mounted at /api/v1/marketplace/meta (via marketplace-routes.ts).
 *
 * Serves a live, standards-compliant OpenAPI 3.1 document describing the NEXUS
 * v1 surface, plus a JSON-Schema dump of the plugin-manifest contract and a
 * self-describing capability catalog. Real, typed, and fail-closed: any error
 * while assembling the document returns an `err` envelope rather than a blank page.
 *
 * The OpenAPI builder is implemented locally (this file) because the server
 * `rootDir` cannot reach the published `@agentic-os/sdk` source; the SDK keeps
 * an equivalent public builder for external consumers.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { NexusEnv } from '../lib/hono-env.js';
import { requireScope } from '../lib/auth-context.js';
import { ok, err } from '../lib/envelope.js';
import { PluginManifestSchema } from '../services/plugin-manifest.js';

export const meta = new Hono<NexusEnv>();

/* ─── Local OpenAPI 3.1 builder (no external deps) ─────────────────────────── */

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  format?: string;
  [key: string]: unknown;
}

function zodToJsonSchema(input: z.ZodTypeAny): JsonSchema {
  const def = (
    input as unknown as { _def?: { typeName?: string; shape?: () => Record<string, z.ZodTypeAny> } }
  )._def;
  const typeName = def?.typeName;
  const out: JsonSchema = {};
  switch (typeName) {
    case 'ZodObject': {
      const props: Record<string, JsonSchema> = {};
      const required: string[] = [];
      const shape = def?.shape?.() ?? {};
      for (const [k, v] of Object.entries(shape)) {
        const child = zodToJsonSchema(v);
        props[k] = child;
        const vt = (v as unknown as { isOptional?: () => boolean }).isOptional?.();
        if (!vt) required.push(k);
      }
      out.type = 'object';
      out.properties = props;
      if (required.length) out.required = required;
      out.additionalProperties = false;
      break;
    }
    case 'ZodString':
      out.type = 'string';
      break;
    case 'ZodNumber':
      out.type = 'number';
      break;
    case 'ZodBoolean':
      out.type = 'boolean';
      break;
    case 'ZodArray':
      out.type = 'array';
      out.items = zodToJsonSchema((input as unknown as { _def: { type: z.ZodTypeAny } })._def.type);
      break;
    case 'ZodEnum': {
      const vals = (input as unknown as { _def: { values: unknown[] } })._def.values;
      out.type = 'string';
      out.enum = vals;
      break;
    }
    default:
      out.type = 'object';
  }
  return out;
}

interface RouteOp {
  path: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  operationId: string;
  summary?: string;
  tags?: string[];
  request?: { body?: z.ZodTypeAny };
  responses?: Record<number, { description: string }>;
}

function toOpenApiPath(p: string): string {
  return p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function buildOpenApiDocument(ops: RouteOp[]) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of ops) {
    const oaPath = toOpenApiPath(op.path);
    const operation: Record<string, unknown> = {
      operationId: op.operationId,
      tags: op.tags ?? [],
    };
    if (op.summary) operation.summary = op.summary;
    if (op.request?.body) {
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: zodToJsonSchema(op.request.body) } },
      };
    }
    const responses: Record<string, unknown> = {};
    for (const [code, def] of Object.entries(op.responses ?? {})) {
      responses[code] = { description: def.description };
    }
    if (!Object.keys(responses).length) responses['200'] = { description: 'Success' };
    operation.responses = responses;
    paths[oaPath] = { ...(paths[oaPath] ?? {}), [op.method]: operation };
  }
  return { openapi: '3.1.0', info: { title: 'NEXUS 2.0 Agentic OS API', version: '2.0.0' }, paths };
}

/** The documented NEXUS v1 surface. */
const ROUTES: RouteOp[] = [
  {
    path: '/api/v1/health',
    method: 'get',
    operationId: 'getHealth',
    summary: 'Liveness/readiness probe',
    tags: ['meta'],
    responses: {
      200: { description: 'Service healthy' },
      503: { description: 'Service degraded' },
    },
  },
  {
    path: '/api/v1/system',
    method: 'get',
    operationId: 'getSystem',
    summary: 'Aggregate system counts and config',
    tags: ['meta'],
    responses: { 200: { description: 'System snapshot' } },
  },
  {
    path: '/api/v1/marketplace/plugins',
    method: 'get',
    operationId: 'listPlugins',
    summary: 'List marketplace plugins',
    tags: ['marketplace'],
    responses: { 200: { description: 'Plugin catalog' } },
  },
  {
    path: '/api/v1/marketplace/plugins/:id',
    method: 'get',
    operationId: 'getPlugin',
    summary: 'Fetch a plugin and its version history',
    tags: ['marketplace'],
    responses: { 200: { description: 'Plugin detail' }, 404: { description: 'Not found' } },
  },
  {
    path: '/api/v1/marketplace/install',
    method: 'post',
    operationId: 'installPlugin',
    summary: 'Install a plugin (resolves dependencies, verifies signature)',
    tags: ['marketplace'],
    request: { body: z.object({ pluginId: z.string(), version: z.string().optional() }) },
    responses: {
      200: { description: 'Install result' },
      400: { description: 'Invalid request / dependency conflict' },
    },
  },
  {
    path: '/api/v1/marketplace/reviews',
    method: 'post',
    operationId: 'addReview',
    summary: 'Submit a marketplace review with a 1–5 rating',
    tags: ['marketplace'],
    request: {
      body: z.object({
        pluginId: z.string(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(2000),
      }),
    },
    responses: { 200: { description: 'Review recorded' }, 400: { description: 'Invalid rating' } },
  },
];

/** GET /meta/openapi.json — the generated OpenAPI 3.1 document. */
meta.get('/openapi.json', async (c) => {
  try {
    const doc = buildOpenApiDocument(ROUTES);
    return c.text(JSON.stringify(doc, null, 2), 200, { 'Content-Type': 'application/json' });
  } catch (e) {
    return c.json(
      err(
        'openapi.generate_failed',
        e instanceof Error ? e.message : String(e),
        c.get('requestId') ?? ''
      )
    );
  }
});

/** GET /meta/schemas/plugin-manifest — JSON Schema of the plugin-manifest contract. */
meta.get('/schemas/plugin-manifest', async (c) => {
  try {
    const schema = zodToJsonSchema(PluginManifestSchema);
    return c.json(ok(schema, c.get('requestId') ?? ''));
  } catch (e) {
    return c.json(
      err(
        'schema.generate_failed',
        e instanceof Error ? e.message : String(e),
        c.get('requestId') ?? ''
      )
    );
  }
});

/** GET /meta/capabilities — the documented capability catalog for plugin authors. */
meta.get('/capabilities', async (c) => {
  await requireScope(c, 'marketplace:read');
  const capabilities = [
    'skill.invoke',
    'skill.read',
    'skill.write',
    'recall.query',
    'recall.write',
    'memory.read',
    'memory.write',
    'llm.complete',
    'kernel.enqueue',
    'kernel.admit',
    'scheduler.peek',
    'cron.schedule',
  ];
  return c.json(ok({ capabilities, denyViaPrefixExcept: true }, c.get('requestId') ?? ''));
});
