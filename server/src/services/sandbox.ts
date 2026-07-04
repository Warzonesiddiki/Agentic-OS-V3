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
import { getEnv } from '../lib/env.js';
import { db } from '../db/client.js';
import { sandboxExecutions } from '../db/client.js';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as acorn from 'acorn';
import { appendAudit } from '../lib/audit.js';

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
    await execAsync('docker', ['info', '--format', '{{.ServerVersion}}']);
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

  const tmpDir = mkdtempSync(join(tmpdir(), 'nexus-sandbox-'));
  const scriptFile = join(tmpDir, input.language === 'python' ? 'script.py' : 'script.js');

  const wrapper =
    input.language === 'python'
      ? input.code
      : `const input = ${JSON.stringify(input.input ?? {})};\\n${input.code}\\nconsole.log(JSON.stringify(module.exports.compiledTask(input)));`;

  writeFileSync(scriptFile, wrapper, 'utf-8');

  const interpreter = input.language === 'python' ? 'python3' : 'node';

  try {
    const { stdout, stderr } = await execAsync(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'none',
        '--memory',
        '256m',
        '--cpus',
        '0.5',
        '--stop-timeout',
        String(Math.ceil(timeoutMs / 1000)),
        '-v',
        `${tmpDir}:/sandbox:ro`,
        image,
        interpreter,
        `/sandbox/${input.language === 'python' ? 'script.py' : 'script.js'}`,
      ],
      { timeout: timeoutMs + 5000, maxBuffer: 1024 * 1024 }
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
      stdout: '',
      stderr: e instanceof Error ? e.message.slice(0, 10000) : String(e).slice(0, 10000),
      durationMs: Date.now() - start,
      exitCode: (e as { code?: number }).code ?? 1,
    };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

// ── AST Pre-Parsing & Dangerous Token Detection ─────────────

/**
 * Regex patterns for dangerous tokens that should never execute.
 * These are checked BEFORE the code reaches any sandbox.
 */
const DANGEROUS_PATTERNS = [
  { pattern: /process\b/, description: 'process global access' },
  { pattern: /\brequire\s*\(/, description: 'require() call' },
  { pattern: /\bimport\s*\(/, description: 'dynamic import()' },
  {
    pattern: /\bglobalThis\s*\.\s*(?:process|require|import)\b/,
    description: 'globalThis access to dangerous globals',
  },
  { pattern: /__proto__/, description: '__proto__ manipulation' },
  { pattern: /constructor\s*\.\s*constructor/, description: 'prototype chain climb' },
];

/**
 * Perform AST pre-parsing using acorn to validate syntax and reject
 * dangerous constructs before any code reaches the sandbox worker.
 * Returns null if the code is valid, or an error message if rejected.
 */
function preParseAndValidate(code: string): string | null {
  // Empty checks
  if (!code || code.trim().length === 0) {
    return 'Empty code';
  }

  // Reject code containing dangerous token patterns
  for (const entry of DANGEROUS_PATTERNS) {
    if (entry.pattern.test(code)) {
      return `Rejected: ${entry.description} detected in code`;
    }
  }

  // Attempt AST parsing to validate syntax
  try {
    acorn.parse(code, {
      ecmaVersion: 2022,
      sourceType: 'script',
      allowAwaitOutsideFunction: true,
    });
  } catch (parseErr) {
    return `Syntax error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;
  }

  return null; // Code is valid
}

// ── Public API ────────────────────────────────────────────────

export async function executeSandboxed(input: SandboxInput): Promise<SandboxResult> {
  const start = Date.now();
  const env = getEnv();

  // Phase 1: AST pre-parsing and validation before any execution context
  const validationError = preParseAndValidate(input.code);
  if (validationError) {
    return {
      ok: false,
      output: null,
      stdout: '',
      stderr: validationError,
      durationMs: Date.now() - start,
      exitCode: 1,
    };
  }

  const useDocker = env.NEXUS_SANDBOX_ENABLED && (await isDockerAvailable());

  // Dynamic import to avoid loading worker_threads module at import time
  // (worker_threads may fail in some test environments)
  const { executeInWorker } = await import('./sandbox-worker.js');

  const result = useDocker ? await executeInDocker(input) : await executeInWorker(input);

  // ── Telemetry & Audit Logging ─────────────────────────────
  const recordId = `sbx_${randomUUID()}`;
  const safeResult = {
    ok: result?.ok ?? false,
    output: result?.output ?? null,
    stdout: result?.stdout ?? '',
    stderr: result?.stderr ?? '',
    durationMs: result?.durationMs ?? Date.now() - start,
    exitCode: result?.exitCode ?? -1,
  };
  await db
    .insert(sandboxExecutions)
    .values({
      id: recordId,
      agentId: 'sandbox',
      type: useDocker ? 'docker' : 'worker',
      code: input.code.slice(0, 5000),
      language: input.language,
      exitCode: safeResult.exitCode,
      stdout: safeResult.stdout.slice(0, 5000),
      stderr: safeResult.stderr.slice(0, 5000),
      durationMs: safeResult.durationMs,
      status: safeResult.ok ? 'completed' : 'failed',
    })
    .catch(() => {
      /* non-critical — log is best-effort */
    });

  // Append audit trail for sandbox execution
  try {
    await appendAudit(
      'sandbox.execute',
      {
        sandboxId: recordId,
        type: useDocker ? 'docker' : 'worker',
        language: input.language,
        durationMs: safeResult.durationMs,
        ok: safeResult.ok,
        exitCode: safeResult.exitCode,
        codeHash:
          input.code.length > 0
            ? createHash('sha256').update(input.code).digest('hex').slice(0, 16)
            : 'empty',
      },
      'system'
    );
  } catch {
    /* non-critical */
  }

  // Export execution metrics to Prometheus-compatible counters
  // These counters are accessible via the /metrics endpoint
  sandboxExecutionCount.total++;
  sandboxExecutionCount[safeResult.ok ? 'success' : 'failure']++;
  sandboxExecutionLatencyMs.total += safeResult.durationMs;
  if (safeResult.durationMs > sandboxExecutionLatencyMs.max) {
    sandboxExecutionLatencyMs.max = safeResult.durationMs;
  }

  return safeResult;
}

// ── Telemetry Counters ────────────────────────────────────────
// In-memory counters for sandbox execution metrics.
// These are exported to Prometheus via the /metrics endpoint.
const sandboxExecutionCount = { total: 0, success: 0, failure: 0 };
const sandboxExecutionLatencyMs = { total: 0, max: 0 };

/**
 * Get sandbox execution metrics for Prometheus export.
 */
export function getSandboxMetrics(): Record<string, number> {
  return {
    sandbox_executions_total: sandboxExecutionCount.total,
    sandbox_executions_success: sandboxExecutionCount.success,
    sandbox_executions_failure: sandboxExecutionCount.failure,
    sandbox_latency_ms_total: sandboxExecutionLatencyMs.total,
    sandbox_latency_ms_max: sandboxExecutionLatencyMs.max,
    sandbox_latency_ms_avg:
      sandboxExecutionCount.total > 0
        ? Math.round(sandboxExecutionLatencyMs.total / sandboxExecutionCount.total)
        : 0,
  };
}

// ── Helpers ───────────────────────────────────────────────────

function parseOutput(stdout: string): unknown {
  const lines = stdout.trim().split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch {
      /* try next */
    }
  }
  return lines[0] ?? null;
}
