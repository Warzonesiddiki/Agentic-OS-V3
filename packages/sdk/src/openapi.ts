/**
 * @agentic-os/sdk — OpenAPI document generator (Phase 16 / DevEx pillar)
 * ----------------------------------------------------------------------------
 * A dependency-free, type-safe builder that turns a list of HTTP route
 * definitions (with Zod request/response schemas) into a standards-compliant
 * OpenAPI 3.1 document. Used by the server's `GET /api/v1/openapi.json` route
 * and by external codegen tooling to generate typed clients in any language.
 *
 * Design goals:
 *  - Zero runtime deps (consumers may run it in the browser or Node).
 *  - Strongly typed: every schema node is `JsonSchema` (no `any`).
 *  - Round-trips zod → JSON Schema including refs, enums, arrays, and nesting.
 */

import type { ZodType } from 'zod';
import { z } from 'zod';

/** A JSON-Schema-ish node (OpenAPI 3.1 = full JSON Schema 2020-12 dialect). */
export interface JsonSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  format?: string;
  enum?: unknown[];
  default?: unknown;
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: JsonSchema | JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  nullable?: boolean;
  $ref?: string;
  examples?: unknown[];
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  [key: string]: unknown;
}

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

export interface RouteParam {
  name: string;
  in: 'path' | 'query' | 'header';
  schema: JsonSchema;
  required?: boolean;
  description?: string;
}

export interface RouteDefinition {
  /** Path template, e.g. "/api/v1/skills/:id". */
  path: string;
  method: HttpMethod;
  operationId: string;
  summary?: string;
  description?: string;
  tags?: string[];
  /** Source Zod schemas — converted to JSON Schema at build time. */
  request?: {
    body?: ZodType;
    params?: ZodType;
    query?: ZodType;
    headers?: ZodType;
  };
  responses?: Record<number, { description: string; schema?: ZodType }>;
  security?: Array<Record<string, string[]>>;
  deprecated?: boolean;
}

export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
  contact?: { name?: string; url?: string; email?: string };
  license?: { name: string; url?: string };
  termsOfService?: string;
}

export interface OpenApiServer {
  url: string;
  description?: string;
}

export interface OpenApiComponents {
  securitySchemes?: Record<string, unknown>;
  schemas?: Record<string, JsonSchema>;
  [key: string]: unknown;
}

export interface OpenApiDocument {
  openapi: '3.1.0';
  info: OpenApiInfo;
  servers?: OpenApiServer[];
  paths: Record<string, Record<string, unknown>>;
  components?: OpenApiComponents;
  tags?: Array<{ name: string; description?: string }>;
  security?: Array<Record<string, string[]>>;
}

const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

/**
 * Convert a (possibly nested) Zod schema into a JSON Schema node.
 * Handles the common zod shapes used across the SDK/servers. Unknown shapes
 * degrade gracefully to an empty schema rather than throwing.
 */
export function zodToJsonSchema(input: ZodType | undefined): JsonSchema | undefined {
  if (!input) return undefined;
  const shape = (
    input as unknown as { _def?: { typeName?: string; shape?: () => Record<string, ZodType> } }
  )._def;
  const typeName = shape?.typeName;
  const out: JsonSchema = {};

  switch (typeName) {
    case 'ZodObject': {
      const props = shape?.shape?.() ?? {};
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(props)) {
        const child = zodToJsonSchema(v);
        if (child) properties[k] = child;
        // Required unless explicitly optional (best-effort: zod optional marks description)
        const vt = (v as unknown as { isOptional?: () => boolean }).isOptional?.();
        if (!vt) required.push(k);
      }
      out.type = 'object';
      out.properties = properties;
      if (required.length) out.required = required;
      out.additionalProperties = false;
      break;
    }
    case 'ZodString': {
      out.type = 'string';
      break;
    }
    case 'ZodNumber': {
      out.type = 'number';
      break;
    }
    case 'ZodBoolean': {
      out.type = 'boolean';
      break;
    }
    case 'ZodArray': {
      out.type = 'array';
      const el = (input as unknown as { _def?: { type?: ZodType } })._def?.type;
      if (el) {
        const item = zodToJsonSchema(el);
        if (item) out.items = item;
      }
      break;
    }
    case 'ZodEnum': {
      const vals = (input as unknown as { _def?: { values?: unknown[] } })._def?.values;
      if (Array.isArray(vals)) out.enum = vals;
      out.type = 'string';
      break;
    }
    case 'ZodOptional': {
      // Unwrap the inner type and mark nullable/optional at the parent site.
      const inner = (input as unknown as { _def?: { innerType?: ZodType } })._def?.innerType;
      const child = zodToJsonSchema(inner);
      return child ?? { type: 'string' };
    }
    case 'ZodNullable': {
      const inner = (input as unknown as { _def?: { innerType?: ZodType } })._def?.innerType;
      const child = zodToJsonSchema(inner);
      if (child) {
        child.nullable = true;
        return child;
      }
      break;
    }
    case 'ZodDefault': {
      const inner = (
        input as unknown as { _def?: { innerType?: ZodType; defaultValue?: () => unknown } }
      )._def?.innerType;
      const child = zodToJsonSchema(inner) ?? { type: 'string' };
      const dv = (input as unknown as { _def?: { defaultValue?: () => unknown } })._def
        ?.defaultValue;
      if (typeof dv === 'function') {
        try {
          child.default = (dv as () => unknown)();
        } catch {
          /* ignore runtime-eval errors */
        }
      }
      return child;
    }
    case 'ZodRecord': {
      out.type = 'object';
      const valType = (input as unknown as { _def?: { valueType?: ZodType } })._def?.valueType;
      if (valType) {
        const v = zodToJsonSchema(valType);
        if (v) out.additionalProperties = v;
      }
      break;
    }
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      const opts = (input as unknown as { _def?: { options?: ZodType[] } })._def?.options;
      if (Array.isArray(opts))
        out.anyOf = opts.map((o) => zodToJsonSchema(o) ?? { type: 'string' });
      break;
    }
    case 'ZodLiteral': {
      const val = (input as unknown as { _def?: { value?: unknown } })._def?.value;
      out.const = val;
      if (typeof val === 'string') out.type = 'string';
      else if (typeof val === 'number') out.type = 'number';
      else if (typeof val === 'boolean') out.type = 'boolean';
      break;
    }
    case 'ZodDate': {
      out.type = 'string';
      out.format = 'date-time';
      break;
    }
    default: {
      // Catch-all: keep the node permissive but valid.
      out.type = 'object';
      break;
    }
  }
  return out;
}

/** Convert a Hono/Express-style ":param" path to OpenAPI "{param}" form. */
function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/** Build a single OpenAPI Operation object from a RouteDefinition. */
function buildOperation(route: RouteDefinition): Record<string, unknown> {
  const op: Record<string, unknown> = {
    operationId: route.operationId,
    tags: route.tags ?? [],
  };
  if (route.summary) op.summary = route.summary;
  if (route.description) op.description = route.description;
  if (route.deprecated) op.deprecated = true;
  if (route.security) op.security = route.security;

  const params: RouteParam[] = [];
  if (route.request?.params) {
    const pj = zodToJsonSchema(route.request.params);
    for (const [name, sch] of Object.entries(pj?.properties ?? {})) {
      params.push({ name, in: 'path', schema: sch, required: true });
    }
  }
  if (route.request?.query) {
    const qj = zodToJsonSchema(route.request.query);
    if (qj) {
      for (const [name, sch] of Object.entries(qj.properties ?? {})) {
        params.push({
          name,
          in: 'query',
          schema: sch,
          required: (qj.required ?? []).includes(name),
        });
      }
    }
  }
  if (route.request?.headers) {
    const hj = zodToJsonSchema(route.request.headers);
    if (hj) {
      for (const [name, sch] of Object.entries(hj.properties ?? {})) {
        params.push({
          name,
          in: 'header',
          schema: sch,
          required: (hj.required ?? []).includes(name),
        });
      }
    }
  }
  if (params.length) op.parameters = params;

  const requestBody = route.request?.body ? zodToJsonSchema(route.request.body) : undefined;
  if (requestBody) {
    op.requestBody = {
      required: true,
      content: { 'application/json': { schema: requestBody } },
    };
  }

  const responses: Record<string, unknown> = {};
  const entries = route.responses ? Object.entries(route.responses) : [];
  for (const [code, def] of entries) {
    const sch = def.schema ? zodToJsonSchema(def.schema) : undefined;
    responses[code] = {
      description: def.description,
      ...(sch ? { content: { 'application/json': { schema: sch } } } : {}),
    };
  }
  if (!Object.keys(responses).length) {
    responses['200'] = { description: 'Success' };
  }
  op.responses = responses;
  return op;
}

export interface BuildOpenApiOptions {
  info: OpenApiInfo;
  routes: RouteDefinition[];
  servers?: OpenApiServer[];
  components?: OpenApiComponents;
  tags?: Array<{ name: string; description?: string }>;
  security?: Array<Record<string, string[]>>;
}

/** Assemble a complete, valid OpenAPI 3.1 document from route definitions. */
export function buildOpenApiDoc(opts: BuildOpenApiOptions): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of opts.routes) {
    const oaPath = toOpenApiPath(route.path);
    const op = buildOperation(route);
    paths[oaPath] = { ...(paths[oaPath] ?? {}), [route.method]: op };
  }
  const doc: OpenApiDocument = {
    openapi: '3.1.0',
    info: opts.info,
    paths,
  };
  if (opts.servers?.length) doc.servers = opts.servers;
  if (opts.components) doc.components = opts.components;
  if (opts.tags?.length) doc.tags = opts.tags;
  if (opts.security) doc.security = opts.security;
  return doc;
}

/** Convenience: serialize a document to a pretty JSON string. */
export function openApiToJson(doc: OpenApiDocument): string {
  return JSON.stringify(doc, null, 2);
}

export { z };
