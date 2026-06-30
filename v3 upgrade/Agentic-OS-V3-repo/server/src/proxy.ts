/**
 * proxy.ts — the API perimeter guard.
 * Applies to every /api/* request, BEFORE any handler:
 *   request ID · CORS · payload-size rejection · rate limiting · security
 *   headers · auth backstop for mutations · structured error envelopes.
 *
 * Mutations (POST/PATCH/PUT/DELETE) are rejected here unless authenticated.
 * Per-route scope checks live with the routes; this is the coarse backstop.
 */
import type { Context, MiddlewareHandler } from "hono";
import { randomBytes } from "node:crypto";
import { env } from "./lib/env.js";
import { authenticate } from "./lib/security.js";
import { db } from "./db/client.js";
import { log } from "./lib/logging.js";
import type { Envelope } from "./lib/envelope.js";
import type { NexusEnv } from "./lib/hono-env.js";
import { consume, clientIpFromHeaders } from "./lib/rateLimit.js";

const ALLOWED_ORIGINS = env.NEXUS_ALLOWED_ORIGINS.split(",").map((s) => s.trim());

export const requestId: MiddlewareHandler<NexusEnv> = async (c, next) => {
  c.set("requestId", `req_${randomBytes(9).toString("base64url")}`);
  await next();
};

export const securityHeaders: MiddlewareHandler<NexusEnv> = async (c, next) => {
  await next();
  c.header("x-content-type-options", "nosniff");
  c.header("x-frame-options", "DENY");
  c.header("referrer-policy", "no-referrer");
  c.header("content-security-policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
  c.header("strict-transport-security", "max-age=31536000; includeSubDomains");
  c.header("cache-control", "no-store");
  c.header("x-request-id", c.get("requestId") ?? "unknown");
};

export const cors: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header("origin") ?? "";
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    c.header("access-control-allow-origin", origin);
    c.header("access-control-allow-headers", "authorization, content-type");
    c.header("access-control-allow-methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    c.header("vary", "origin");
  }
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
};

/** Reject oversized payloads before any handler reads the body. */
export const payloadLimit: MiddlewareHandler = async (c, next) => {
  const len = Number(c.req.header("content-length") ?? 0);
  if (len && len > env.NEXUS_MAX_BODY_BYTES) {
    return c.json<Envelope>({ ok: false, error: { code: "PAYLOAD_TOO_LARGE", message: `Body exceeds ${env.NEXUS_MAX_BODY_BYTES} bytes.` }, traceId: c.get("requestId") ?? "" }, 413);
  }
  await next();
};

export const rateLimit: MiddlewareHandler<NexusEnv> = async (c, next) => {
  const headers: Record<string, string | string[] | undefined> = {};
  const xff = c.req.header("x-forwarded-for");
  if (xff) headers["x-forwarded-for"] = xff;
  const ip = clientIpFromHeaders(headers, c.env?.incoming?.socket?.remoteAddress);
  const isSSE = c.req.path === "/api/v1/events";
  const result = await consume(ip, isSSE ? "sse" : "rest");
  if (!result.allowed) {
    return c.json<Envelope>(
      { ok: false, error: { code: "RATE_LIMITED", message: `Rate limit of ${env.NEXUS_RATE_LIMIT_PER_MINUTE}/min exceeded.` }, traceId: c.get("requestId") ?? "" },
      429
    );
  }
  await next();
};

const MUTATION = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * Defense-in-depth auth backstop: EVERY /api/v1/* request (read OR write)
 * requires a valid principal, except the single public GET /api/v1/health.
 * Per-route requireScope() still enforces granularity; this guarantees an
 * unauthenticated request can NEVER reach a sensitive read even if a route
 * forgets its scope check.
 */
export const authBackstop: MiddlewareHandler<NexusEnv> = async (c, next) => {
  const path = c.req.path;
  if (path === "/api/v1/health" && c.req.method === "GET") {
    await next();
    return;
  }
  // Only the versioned API surface is gated here (the dashboard is served elsewhere).
  if (path.startsWith("/api/v1")) {
    const key = c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();
    const principal = await authenticate(db, key ?? null);
    if (!principal) {
      log.warn("auth_denied", { path, method: c.req.method });
      return c.json<Envelope>(
        { ok: false, error: { code: "UNAUTHORIZED", message: MUTATION.has(c.req.method) ? "A valid API key is required for mutations." : "Authentication required." }, traceId: c.get("requestId") ?? "" },
        401
      );
    }
    c.set("principal", principal);
  }
  await next();
};

export type Ctx = Context;
