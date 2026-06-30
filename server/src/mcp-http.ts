/**
 * mcp-http.ts — real Model Context Protocol over Streamable HTTP.
 *
 * Implements the SDK's official stateless pattern: a fresh transport per
 * request, connected to a freshly-built McpServer. The transport reads the
 * JSON-RPC body from the Node IncomingMessage and writes the response to the
 * Node ServerResponse directly. Tools route through the SAME auth + services +
 * audit as REST — MCP never bypasses security.
 *
 * Mounted as a raw Node request listener at /api/mcp by index.ts.
 */
import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createNexusMcpServer } from "./mcp.js";
import { authenticate } from "./lib/security.js";
import { db } from "./db/client.js";
import { env } from "./lib/env.js";
import { consume, clientIpFromHeaders } from "./lib/rate-limit.js";

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
};

function applySecurityHeaders(res: ServerResponse): void {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  res.setHeader("x-request-id", `req_${randomBytes(9).toString("base64url")}`);
}

function send(res: ServerResponse, status: number, json: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(json));
}

async function readBody(req: IncomingMessage): Promise<unknown | null> {
  return await new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (!chunks.length) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

/**
 * Handle one MCP request. Returns true if it produced a response.
 * Stateless mode: no session ID, no SSE; plain JSON responses.
 */
export async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  applySecurityHeaders(res);

  // CORS (browser-based MCP clients need the session header exposed).
  const origin = req.headers["origin"];
  if (origin && env.NEXUS_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).includes(String(origin))) {
    res.setHeader("access-control-allow-origin", String(origin));
    res.setHeader("access-control-allow-headers", "authorization, content-type, mcp-session-id");
    res.setHeader("access-control-expose-headers", "mcp-session-id");
    res.setHeader("vary", "origin");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  if (req.method !== "POST") {
    send(res, 405, { jsonrpc: "2.0", error: { code: -32601, message: "Only POST is supported (stateless MCP)." }, id: null });
    return true;
  }

  // Rate limit — the MCP path bypasses Hono's middleware, so enforce it here
  // too, keyed on the (unspoofable) socket address unless behind a trusted proxy.
  const ip = clientIpFromHeaders(req.headers as Record<string, string | string[] | undefined>, req.socket.remoteAddress);
  const rl = await consume(ip, "mcp");
  if (!rl.allowed) {
    send(res, 429, { jsonrpc: "2.0", error: { code: -32000, message: `Rate limit of ${env.NEXUS_RATE_LIMIT_PER_MINUTE}/min exceeded.` }, id: null });
    return true;
  }

  // Payload limit — enforced before reading the body (same cap as REST).
  const len = Number(req.headers["content-length"] ?? 0);
  if (len && len > env.NEXUS_MAX_BODY_BYTES) {
    send(res, 413, { jsonrpc: "2.0", error: { code: -32000, message: `Body exceeds ${env.NEXUS_MAX_BODY_BYTES} bytes.` }, id: null });
    return true;
  }

  // Auth — required for MCP. Same cached authenticator as REST.
  const raw = req.headers["authorization"]?.replace(/^Bearer\s+/i, "").trim() ?? null;
  const principal = await authenticate(db, raw);
  if (!principal) {
    send(res, 401, { ok: false, error: { code: "UNAUTHORIZED", message: "MCP requires a valid API key." } });
    return true;
  }

  const body = await readBody(req);
  if (body == null) {
    send(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error: empty or invalid JSON body." }, id: null });
    return true;
  }

  // Stateless transport: a new transport + server per request. Clean up on close.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  // Audit actor uses the STABLE principal id (not the mutable name).
  const server = createNexusMcpServer(principal.id, principal.scopes);
  res.on("close", () => {
    transport.close();
    server.close().catch(() => {});
  });
  await server.connect(transport);
  // The transport writes the JSON-RPC response straight to `res`.
  await transport.handleRequest(req, res, body as Record<string, unknown>);
  return true;
}
