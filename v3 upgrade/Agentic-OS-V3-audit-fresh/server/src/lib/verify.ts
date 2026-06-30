/**
 * verify.ts — real end-to-end integration verification.
 *
 * Makes actual HTTP requests against a running NEXUS server to confirm the
 * connection works. No mocks, no stubs, no "it should work" assumptions.
 * Each test exercises the real database, real auth, real validation.
 */

export interface VerifyStep {
  name: string;
  description: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

interface VerifyResult {
  steps: VerifyStep[];
  allPassed: boolean;
  durationMs: number;
}

async function apiCall(
  origin: string,
  key: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const url = `${origin}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, data: { error: e instanceof Error ? e.message : String(e) } };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Run the full integration verification against a live NEXUS server.
 * Tests: health ping, auth, write, read, audit chain integrity.
 */
export async function verifyIntegration(origin: string, key: string): Promise<VerifyResult> {
  const steps: VerifyStep[] = [];
  const totalStart = Date.now();

  // Step 1: Health check (public, no auth needed)
  {
    const start = Date.now();
    const res = await apiCall(origin, "", "GET", "/api/v1/health");
    const detail =
      res.status === 0
        ? `Connection failed — is the server running at ${origin}?`
        : `HTTP ${res.status}`;
    steps.push({
      name: "health",
      description: "GET /api/v1/health — server reachable",
      passed: res.status === 200,
      detail: res.status === 200
        ? `Server healthy: ${JSON.stringify(res.data)}`
        : detail,
      durationMs: Date.now() - start,
    });
  }

  // Step 2: Auth check — stats requires a valid key
  {
    const start = Date.now();
    const res = await apiCall(origin, key, "GET", "/api/v1/system");
    const data = res.data as { ok?: boolean; data?: { counts?: unknown } } | null;
    steps.push({
      name: "auth",
      description: "GET /api/v1/system — API key valid",
      passed: res.status === 200 && Boolean(data?.ok),
      detail:
        res.status === 401
          ? "FAILED — API key rejected (401). Check the key in .mcp.json matches the DB."
          : res.status === 200
            ? "Authenticated successfully"
            : `HTTP ${res.status}`,
      durationMs: Date.now() - start,
    });
  }

  // Step 3: Write test — store a test memory
  const testTitle = `Integration Test ${Date.now()}`;
  const testContent = "Hermes connection verified via nexus connect hermes --verify.";
  {
    const start = Date.now();
    const res = await apiCall(origin, key, "POST", "/api/v1/memories", {
      kind: "fact",
      title: testTitle,
      content: testContent,
      tags: ["integration-test"],
      importance: 0.5,
    });
    const data = res.data as { ok?: boolean; data?: { id?: string } } | null;
    const memId = data?.data?.id;
    steps.push({
      name: "write",
      description: "POST /api/v1/memories — write test memory",
      passed: res.status === 201 && Boolean(memId),
      detail:
        res.status === 423
          ? "FAILED — Kill switch is engaged (423). Run `nexus` dashboard → Safety → Release."
          : res.status === 201
            ? `Memory stored: ${memId}`
            : `HTTP ${res.status}: ${JSON.stringify(res.data)}`,
      durationMs: Date.now() - start,
    });
  }

  // Step 4: Read test — recall the memory we just wrote
  {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 100)); // brief pause for index
    const res = await apiCall(origin, key, "GET", `/api/v1/recall?q=${encodeURIComponent(testTitle)}&budget=500`);
    const data = res.data as { data?: { returned?: Array<{ title?: string }> } } | null;
    const found = data?.data?.returned?.some((item) => item.title === testTitle);
    steps.push({
      name: "read",
      description: "GET /api/v1/recall — recall test memory",
      passed: Boolean(found),
      detail: found
        ? "Test memory successfully recalled"
        : res.status === 200
          ? "Memory stored but not yet recalled (may need re-indexing)"
          : `HTTP ${res.status}`,
      durationMs: Date.now() - start,
    });
  }

  // Step 5: Audit chain verification
  {
    const start = Date.now();
    const res = await apiCall(origin, key, "GET", "/api/v1/audit");
    const data = res.data as { data?: { valid?: boolean; verifiedEntries?: number } } | null;
    const valid = data?.data?.valid;
    steps.push({
      name: "audit",
      description: "GET /api/v1/audit — verify hash chain integrity",
      passed: valid === true,
      detail: valid === true
        ? `Audit chain valid (${data?.data?.verifiedEntries} entries verified)`
        : valid === false
          ? "FAILED — Audit chain is BROKEN. Memory may have been tampered with."
          : `HTTP ${res.status}`,
      durationMs: Date.now() - start,
    });
  }

  return {
    steps,
    allPassed: steps.every((s) => s.passed),
    durationMs: Date.now() - totalStart,
  };
}
