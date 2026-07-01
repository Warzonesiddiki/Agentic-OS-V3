/**
 * index.ts — server entrypoint.
 *
 * ONE http.Server branches by path:
 *   /api/mcp  → real Streamable HTTP MCP transport (mcp-http.ts), auth required
 *   everything else → Hono app through the node-server request listener,
 *                     fronted by the proxy.ts perimeter guard
 *
 * Auth is required for MCP and for every mutation.
 *
 * KEY FIXES:
 *  - Lazy imports: `createApp()` is called inside bootstrap(), not at module
 *    top level, so importing this module doesn't crash if DB/env is unavailable.
 *  - `uncaughtException` now exits the process (Node docs warn against
 *    continuing — the process may be in inconsistent state).
 *  - Bootstrap verifies DB reachability before appending the boot audit event.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { log, fatal } from "./lib/logging.js";

let server: ReturnType<typeof createServer> | null = null;

async function bootstrap(): Promise<void> {
  // Lazy imports — defer until bootstrap so CLI tools / tests that import
  // individual modules don't trigger the DB connection or env validation.
  const { getEnv } = await import("./lib/env.js");
  const env = getEnv();
  const { ensureSchemaOrDie, dbReachable } = await import("./setup.js");
  const { createApp } = await import("./app.js");
  const { db } = await import("./db/client.js");
  const { hashApiKey, generateApiKey, invalidateAuthCache } = await import("./lib/security.js");
  const { apiKeys } = await import("./db/schema.js");
  const { eq } = await import("drizzle-orm");
  const { appendAudit } = await import("./lib/audit.js");
  const { isKillSwitchOn } = await import("./services.js");
  const { handleMcp } = await import("./mcp-http.js");
  const { randomUUID } = await import("node:crypto");

  // Initialize OpenTelemetry if configured.
  const { initOtel } = await import("./lib/otel.js");
  await initOtel();

  // Verify the schema is present (single source of truth: Drizzle, via db:push).
  await ensureSchemaOrDie();

  const app = createApp();
  const honoListener = getRequestListener(app.fetch);

  server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.url?.split("?")[0] === "/api/mcp") {
        await handleMcp(req, res);
        return;
      }
      honoListener(req, res);
    } catch (err) {
      log.error("request_fatal", { url: req.url, error: err instanceof Error ? err.message : String(err) });
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal error" } }));
      }
    }
  });

  // Verify DB is reachable before attempting to write the boot audit event.
  const dbOk = await dbReachable();
  if (!dbOk) {
    fatal("Database is not reachable. Check DATABASE_URL and ensure Postgres is running.");
  }

  // Ensure at least one ACTIVE operator principal exists. Without the filter,
  // a disabled key would block creation of a new one, locking everyone out.
  const existing = await db.query.apiKeys.findFirst({ where: eq(apiKeys.status, "active") });
  if (!existing) {
    const raw = env.NEXUS_API_KEY || generateApiKey();
    await db.insert(apiKeys).values({
      id: `prn_${randomUUID()}`,
      name: "operator",
      keyHash: hashApiKey(raw),
      scopes: ["memory:read", "memory:write", "skill:read", "skill:write", "brain:admin", "vault:read", "vault:write", "safety:write", "audit:read"],
      status: "active",
    });
    invalidateAuthCache();
    if (!env.NEXUS_API_KEY) {
      log.info("bootstrap", { message: "Generated operator API key (store it now — shown once)", key: raw });
    }
  }

  await appendAudit("system.booted", { version: "2.0.0", killSwitch: await isKillSwitchOn() }, "system");

  const bus = await import("./services/message-bus.js");
  log.info("bus_initialized");

  // Start the background task worker — polls tasks, processes them, and runs maintenance.
  const { startWorker } = await import("./services/task-worker.js");
  startWorker("system-worker");

  server.listen(env.PORT || 0, '127.0.0.1', () => {
        const addr = server!.address();
        const actualPort = typeof addr === 'string' ? addr : addr?.port;
        if (actualPort === undefined) {
            throw new Error('Failed to get server port');
        }
        require('fs').writeFileSync('/tmp/nexus-port.txt', actualPort.toString());
    });

}

// ── Graceful Shutdown ─────────────────────────────────────────

let shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutdown", { signal });

  // Stop background worker first (no new work while we drain).
  try {
    const { stopWorker } = await import("./services/task-worker.js");
    stopWorker();
  } catch { /* best-effort */ }

  log.info("bus_stopped");

  // Close the HTTP server with a 5s drain timeout.
  if (server) {
    await new Promise<void>((resolve) => {
      const drainTimer = setTimeout(() => {
        log.warn("shutdown_drain_timeout");
        resolve();
      }, 5000);
      server!.close(() => {
        clearTimeout(drainTimer);
        resolve();
      });
    });
  }

  // Close the database pool.
  try {
    const { closeDb } = await import("./db/client.js");
    await closeDb();
  } catch { /* best-effort */ }

  // Flush OpenTelemetry if it was initialized.
  try {
    const { shutdownOtel } = await import("./lib/otel.js");
    if (typeof shutdownOtel === "function") await shutdownOtel();
  } catch { /* best-effort */ }

  log.info("shutdown_complete", { signal });
  process.exit(0);
}

process.on("uncaughtException", (err) => {
  log.error("uncaught_exception", { error: err.message, stack: err.stack });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  log.error("unhandled_rejection", { reason: String(reason) });
  process.exit(1);
});
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

bootstrap().catch((e) => fatal("Boot failed", e));
