/**
 * services/sandbox.ts — Docker / Worker sandbox execution environment.
 *
 * Replaces the unsafe `new Function()` eval in skill-compiler.ts with
 * real sandboxed execution — either inside ephemeral Docker containers
 * or, when Docker is unavailable, using Node.js worker threads with an
 * isolated context that blocks access to `require`, `process`, and
 * all dangerous globals.
 *
 * When Docker is unavailable (or NEXUS_SANDBOX_ENABLED=false), falls
 * back to worker-based in-process execution (for development convenience).
 */
import { getEnv } from "../lib/env.js";
import { db } from "../db/client.js";
import { sandboxExecutions } from "../db/client.js";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(execFile);

// ── Types ─────────────────────────────────────────────────────

export interface SandboxInput {
  code: string;
  language: string;
  input?: unknown;
  timeoutMs?: number;
}

export interface SandboxResult {
  ok: boolean;
  output: unknown;
  stdout: string;
  stderr: string;
  durationMs: number;
  exitCode: number | null;
}

// ── Sandbox Check ─────────────────────────────────────────────

let _dockerAvailable: boolean | null = null;

export async function isDockerAvailable(): Promise<boolean> {
  if (_dockerAvailable !== null) return _dockerAvailable;
  try {
    await execAsync("docker", ["info", "--format", "{{.ServerVersion}}"]);
    _dockerAvailable = true;
  } catch {
    _dockerAvailable = false;
  }
  return _dockerAvailable;
}

// ── Docker Sandbox ────────────────────────────────────────────

async function executeInDocker(input: SandboxInput): Promise<SandboxResult> {
  const env = getEnv();
  const image = env.NEXUS_SANDBOX_IMAGE;
  const timeoutMs = input.timeoutMs ?? env.NEXUS_SANDBOX_TIMEOUT_MS;
  const start = Date.now();

  const tmpDir = mkdtempSync(join(tmpdir(), "nexus-sandbox-"));
  const scriptFile = join(tmpDir, input.language === "python" ? "script.py" : "script.js");

  const wrapper = input.language === "python"
    ? input.code
    : `const input = ${JSON.stringify(input.input ?? {})};\\n${input.code}\\nconsole.log(JSON.stringify(module.exports.compiledTask(input)));`;

  writeFileSync(scriptFile, wrapper, "utf-8");

  const interpreter = input.language === "python" ? "python3" : "node";

  try {
    const { stdout, stderr } = await execAsync(
      "docker",
      [
        "run", "--rm", "--network", "none",
        "--memory", "256m", "--cpus", "0.5",
        "--stop-timeout", String(Math.ceil(timeoutMs / 1000)),
        "-v", `${tmpDir}:/sandbox:ro`,
        image,
        interpreter, `/sandbox/${input.language === "python" ? "script.py" : "script.js"}`,
      ],
      { timeout: timeoutMs + 5000, maxBuffer: 1024 * 1024 },
    );

    const output = parseOutput(stdout);
    return {
      ok: true,
      output,
      stdout: stdout.slice(0, 10000),
      stderr: stderr.slice(0, 10000),
      durationMs: Date.now() - start,
      exitCode: 0,
    };
  } catch (e) {
    return {
      ok: false,
      output: null,
      stdout: "",
      stderr: e instanceof Error ? e.message.slice(0, 10000) : String(e).slice(0, 10000),
      durationMs: Date.now() - start,
      exitCode: (e as { code?: number }).code ?? 1,
    };
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

// ── Public API ────────────────────────────────────────────────

export async function executeSandboxed(input: SandboxInput): Promise<SandboxResult> {
  const env = getEnv();
  const useDocker = env.NEXUS_SANDBOX_ENABLED && await isDockerAvailable();

  // Dynamic import to avoid loading worker_threads module at import time
  // (worker_threads may fail in some test environments)
  const { executeInWorker } = await import("./sandbox-worker.js");

  const result = useDocker
    ? await executeInDocker(input)
    : await executeInWorker(input);

  const recordId = `sbx_${randomUUID()}`;
  await db.insert(sandboxExecutions).values({
    id: recordId,
    agentId: "sandbox",
    type: useDocker ? "docker" : "worker",
    code: input.code.slice(0, 5000),
    language: input.language,
    exitCode: result.exitCode,
    stdout: result.stdout.slice(0, 5000),
    stderr: result.stderr.slice(0, 5000),
    durationMs: result.durationMs,
    status: result.ok ? "completed" : "failed",
  }).catch(() => { /* non-critical — log is best-effort */ });

  return result;
}

// ── Helpers ───────────────────────────────────────────────────

function parseOutput(stdout: string): unknown {
  const lines = stdout.trim().split("\n").filter(Boolean);
  for (const line of lines) {
    try { return JSON.parse(line); } catch { /* try next */ }
  }
  return lines[0] ?? null;
}
