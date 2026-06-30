/**
 * routes/sse.ts — SSE live state streaming with token-based auth.
 */
import { Hono } from "hono";
import type { NexusEnv } from "../lib/hono-env.js";
import { ok, err } from "../lib/envelope.js";

export const sse = new Hono<NexusEnv>();

const sseTokens = new Map<string, { principalId: string; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [token, data] of sseTokens) {
    if (data.expiresAt <= now) sseTokens.delete(token);
  }
}, 30_000);

sse.post("/api/v1/events/token", async (c) => {
  const bearerKey = c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!bearerKey) return c.json(err("UNAUTHORIZED", "Authorization header required.", c.get("requestId") ?? ""), 401);
  const { authenticate: auth } = await import("../lib/security.js");
  const { db } = await import("../db/client.js");
  const principal = await auth(db, bearerKey);
  if (!principal) return c.json(err("UNAUTHORIZED", "Invalid API key.", c.get("requestId") ?? ""), 401);
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(16).toString("hex");
  sseTokens.set(token, { principalId: principal.id, expiresAt: Date.now() + 60_000 });
  return c.json(ok({ token, expiresIn: 60 }, c.get("requestId") ?? ""));
});

sse.get("/api/v1/events", async (c) => {
  const token = c.req.query("token");
  if (token) {
    const data = sseTokens.get(token);
    if (!data || data.expiresAt <= Date.now()) {
      sseTokens.delete(token ?? "");
      return c.json(err("UNAUTHORIZED", "SSE token expired or invalid.", c.get("requestId") ?? ""), 401);
    }
  } else {
    const bearerKey = c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (bearerKey) {
      const { authenticate: auth } = await import("../lib/security.js");
      const { db } = await import("../db/client.js");
      const principal = await auth(db, bearerKey);
      if (!principal) return c.json(err("UNAUTHORIZED", "Invalid API key.", c.get("requestId") ?? ""), 401);
    }
  }
  const { addSSEClient } = await import("../services/sse-bus.js");
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const writer = {
        write: (chunk: string) => { try { controller.enqueue(encoder.encode(chunk)); } catch { /* closed */ } },
        close: () => { try { controller.close(); } catch { /* closed */ } },
      };
      const cleanup = addSSEClient(writer);
      (c.req.raw as unknown as NodeJS.ReadableStream).on("close", cleanup);
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
});

sse.get("/api/v1/events/count", async (c) => {
  const { getSSEClientCount } = await import("../services/sse-bus.js");
  return c.json(ok({ clients: getSSEClientCount() }, c.get("requestId") ?? ""));
});
