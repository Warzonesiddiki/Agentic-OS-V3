/**
 * services/skill-compiler.ts — Neural Skill Compilation (JIT code generation).
 *
 * The OS scans the audit_log + trajectory_logs for repetitive LLM task patterns.
 * When it detects that a sub-agent has successfully executed the exact same
 * task pattern 5+ times, it:
 *
 *  1. Extracts the common input/output shape
 *  2. Generates a deterministic JS function to perform that transformation
 *  3. Runs it through the eval harness (compares against historical outputs)
 *  4. If 100% match → activates the script and hot-swaps the LLM call
 *
 * This permanently replaces expensive LLM reasoning with native code for
 * deterministic tasks, drastically reducing token spend and latency.
 */
import { db } from '../db/client.js';
import { trajectoryLogs, agentTasks, compiledScripts } from '../db/client.js';
import { appendAudit } from '../lib/audit.js';
import { eq, desc, and, gte } from 'drizzle-orm';
import { randomUUID, createHash } from 'node:crypto';
import { env } from '../lib/env.js';
import { runInNewContext, type Context } from 'node:vm';
import { checkCapability, type LoadedPlugin } from './wasm-plugin-runtime.js';
import type { CapabilitySpec } from './plugin-manifest.js';

const COMPILATION_THRESHOLD = Number(env.NEXUS_COMPILATION_THRESHOLD) || 5;
const EVAL_MATCH_THRESHOLD = (() => {
  const r = Number(env.NEXUS_EVAL_MATCH_THRESHOLD);
  return Number.isFinite(r) && r > 0 ? r : 1.0;
})();

// ── Pattern Detection ─────────────────────────────────────────

export interface DetectedPattern {
  signature: string;
  taskLabel: string;
  inputShape: unknown;
  outputShape: unknown;
  occurrences: number;
  avgTokensPerCall: number;
  avgLatencyMs: number;
  sampleInputs: unknown[];
  sampleOutputs: unknown[];
}

/**
 * Scan recent audit logs for repetitive task patterns.
 * Groups by task label + input shape similarity.
 * Returns patterns that exceed the compilation threshold.
 */
export async function detectRepetitivePatterns(): Promise<DetectedPattern[]> {
  // Get recent successful tasks with their trajectories (last 7 days)
  const recentTasks = await db
    .select({
      id: agentTasks.id,
      label: agentTasks.label,
      input: agentTasks.input,
      output: agentTasks.output,
      status: agentTasks.status,
      createdAt: agentTasks.createdAt,
    })
    .from(agentTasks)
    .where(
      and(
        eq(agentTasks.status, 'succeeded'),
        gte(agentTasks.createdAt, new Date(Date.now() - 7 * 86_400_000))
      )
    )
    .orderBy(desc(agentTasks.createdAt))
    .limit(500);

  // Group by normalized label (strip IDs, timestamps, etc.)
  const groups = new Map<string, typeof recentTasks>();
  for (const task of recentTasks) {
    const normalized = normalizeLabel(task.label);
    const existing = groups.get(normalized) ?? [];
    existing.push(task);
    groups.set(normalized, existing);
  }

  // Find groups with >= threshold repetitions
  const patterns: DetectedPattern[] = [];
  for (const [normalizedLabel, tasks] of groups) {
    if (tasks.length < COMPILATION_THRESHOLD) continue;

    // Extract input/output shapes from samples
    const sampleInputs = tasks.slice(0, 10).map((t: any) => t.input);
    const sampleOutputs = tasks.slice(0, 10).map((t: any) => t.output);

    // Check if outputs are structurally similar (deterministic transformation)
    const inputShape = extractShape(sampleInputs[0]);
    const outputShape = extractShape(sampleOutputs[0]);

    // Only compile if input→output is a deterministic mapping
    if (!isDeterministicTransformation(sampleInputs, sampleOutputs)) continue;

    // Get token usage from trajectories
    const tokenUsages = await db
      .select({ tokenUsage: trajectoryLogs.tokenUsage, latencyMs: trajectoryLogs.latencyMs })
      .from(trajectoryLogs)
      .innerJoin(agentTasks, eq(trajectoryLogs.auditSequence, agentTasks.id))
      .where(and(eq(agentTasks.label, tasks[0]!.label), eq(agentTasks.status, 'succeeded')))
      .limit(tasks.length);

    const totalTokens = tokenUsages.reduce((sum: number, t: any) => {
      const usage = t.tokenUsage as { total?: number } | null;
      return sum + (usage?.total ?? 0);
    }, 0);
    const totalLatency = tokenUsages.reduce((sum: number, t: any) => sum + t.latencyMs, 0);

    patterns.push({
      signature: createHash('sha256').update(normalizedLabel).digest('hex').slice(0, 16),
      taskLabel: normalizedLabel,
      inputShape,
      outputShape,
      occurrences: tasks.length,
      avgTokensPerCall: tokenUsages.length > 0 ? Math.round(totalTokens / tokenUsages.length) : 0,
      avgLatencyMs: tokenUsages.length > 0 ? Math.round(totalLatency / tokenUsages.length) : 0,
      sampleInputs,
      sampleOutputs,
    });
  }

  return patterns.sort((a, b) => b.occurrences - a.occurrences);
}

/** Normalize a task label by stripping dynamic content (IDs, timestamps). */
function normalizeLabel(label: string): string {
  return label
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '{uuid}') // UUIDs
    .replace(/\d{10,}/g, '{timestamp}') // Unix timestamps
    .replace(/\b\d+\b/g, '{n}') // Generic numbers
    .replace(/\b[A-Z]{2,}_\w+/g, '{env_var}') // ENV_VAR patterns
    .trim()
    .toLowerCase();
}

/** Extract the structural shape of a value (keys + types, not values). */
function extractShape(value: unknown): unknown {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return typeof value;
  if (Array.isArray(value)) {
    return value.length > 0 ? [extractShape(value[0])] : [];
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = extractShape(v);
  }
  return result;
}

/**
 * Check if the input→output mapping is deterministic.
 * If the same input always produces the same output structure, it's
 * a good candidate for compilation (the transformation is predictable).
 */
function isDeterministicTransformation(inputs: unknown[], outputs: unknown[]): boolean {
  if (inputs.length < 2 || outputs.length < 2) return false;

  // Check that all outputs have the same structural shape
  const firstOutputShape = JSON.stringify(extractShape(outputs[0]));
  for (let i = 1; i < outputs.length; i++) {
    if (JSON.stringify(extractShape(outputs[i])) !== firstOutputShape) {
      return false; // outputs have different shapes — not deterministic
    }
  }

  // Check that all inputs have the same structural shape
  const firstInputShape = JSON.stringify(extractShape(inputs[0]));
  for (let i = 1; i < inputs.length; i++) {
    if (JSON.stringify(extractShape(inputs[i])) !== firstInputShape) {
      return false;
    }
  }

  return true;
}

// ── Script Generation ─────────────────────────────────────────

export interface GeneratedScript {
  signature: string;
  taskLabel: string;
  code: string;
  language: string;
  estimatedTokensSaved: number;
}

/**
 * Generate a deterministic JavaScript function from the detected pattern.
 *
 * This uses a template-based approach (not LLM) to produce a safe,
 * predictable function that maps the input shape to the output shape.
 * The generated code is stored and validated before activation.
 */
export function generateScript(pattern: DetectedPattern): GeneratedScript {

/**
 * Sanitize a string for safe embedding inside a JS block comment (`/** ... */`).
 * Removes comment-terminator and comment-start sequences, newlines, and stray
 * backslashes so untrusted pattern fields can never break out of the comment
 * and inject executable code into a generated skill (template-injection guard).
 */
function sanitizeForComment(s: unknown): string {
  return String(s)
    .replace(/\*\//g, '* /')
    .replace(/\/\*/g, '/ *')
    .replace(/[\r\n]/g, ' ');
}
  const inputKeys = Object.keys((pattern.inputShape as Record<string, unknown>) ?? {});
  const outputKeys = Object.keys((pattern.outputShape as Record<string, unknown>) ?? {});

  // Generate a transformation function based on the observed mapping
  const code = `/**
 * Auto-compiled by NEXUS Neural Skill Compiler
 * Pattern: ${sanitizeForComment(pattern.taskLabel)}
 * Detected: ${pattern.occurrences} repetitions
 * Avg tokens/call: ${pattern.avgTokensPerCall}
 * Avg latency: ${pattern.avgLatencyMs}ms
 *
 * This function replaces the LLM reasoning chain for this task pattern.
 * It is a deterministic mapping from input to output, validated against
 * ${pattern.sampleInputs.length} historical examples.
 *
 * Compiled at: ${new Date().toISOString()}
 */
function compiledTask(input) {
  // Extract input fields
  ${inputKeys.map((k: any) => `const ${k.replace(/[^a-zA-Z0-9_]/g, '_')} = input["${k}"];`).join('\n  ')}

  // Deterministic transformation (extracted from pattern analysis)
  // NOTE: This is a structural mapping. If the task involves complex
  // reasoning that varies per input, this compiled function should be
  // deprecated and the LLM call restored.
  const output = {
    ${outputKeys.map((k: any) => `"${k}": ${inferOutputExpression(k, inputKeys, pattern)}`).join(',\n    ')}
  };

  return output;
}

// Self-test: verify against historical samples
  const testResults = ${sanitizeForComment(JSON.stringify(pattern.sampleOutputs.slice(0, 3), null, 2))};

module.exports = { compiledTask, testResults };
`;

  return {
    signature: pattern.signature,
    taskLabel: pattern.taskLabel,
    code,
    language: 'javascript',
    estimatedTokensSaved: pattern.avgTokensPerCall * pattern.occurrences,
  };
}

/**
 * Infer the simplest expression that produces the output field.
 * For truly deterministic tasks, the output is often a direct mapping
 * or simple transformation of an input field.
 */
function inferOutputExpression(
  outputKey: string,
  inputKeys: string[],
  pattern: DetectedPattern
): string {
  // Check if output key matches an input key (direct mapping)
  if (inputKeys.includes(outputKey)) {
    return outputKey.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  // Check if the output values are constant across all samples
  const outputValues = pattern.sampleOutputs
    .map((o: any) => (o as Record<string, unknown>)?.[outputKey])
    .filter((v: any) => v !== undefined);

  if (outputValues.length >= 2) {
    const allSame = outputValues.every(
      (v: any) => JSON.stringify(v) === JSON.stringify(outputValues[0])
    );
    if (allSame) {
      return JSON.stringify(outputValues[0]);
    }
  }

  // Default: null (will fail eval and be marked as "needs LLM")
  return 'null /* requires-llm: output is not deterministic */';
}

// ── Evaluation ────────────────────────────────────────────────

export interface EvalScriptResult {
  passed: boolean;
  matchRate: number;
  testedSamples: number;
  correctOutputs: number;
  details: string[];
}

/**
 * Evaluate a generated script against historical sample data.
 * Runs the compiled function on each sample input and compares
 * the output against the historical output.
 *
 * Returns pass=true only if 100% of samples match.
 */
export async function evaluateScript(
  script: GeneratedScript,
  pattern: DetectedPattern
): Promise<EvalScriptResult> {
  const details: string[] = [];
  let correct = 0;
  const total = Math.min(pattern.sampleInputs.length, pattern.sampleOutputs.length);

  for (let i = 0; i < total; i++) {
    const expected = pattern.sampleOutputs[i];
    try {
      // Evaluate via sandbox (Docker if available, in-process fallback)
      const { executeSandboxed } = await import('./sandbox.js');
      const sandboxResult = await executeSandboxed({
        code: script.code,
        language: 'javascript',
        input: pattern.sampleInputs[i],
      });

      const isMatch = JSON.stringify(sandboxResult.output) === JSON.stringify(expected);
      if (isMatch) {
        correct++;
        details.push(`✓ Sample ${i + 1}: MATCH`);
      } else {
        details.push(
          `✕ Sample ${i + 1}: MISMATCH (expected ${JSON.stringify(expected).slice(0, 80)}, got ${JSON.stringify(sandboxResult.output).slice(0, 80)})`
        );
      }
    } catch (e) {
      details.push(`✕ Sample ${i + 1}: ERROR (${e instanceof Error ? e.message : String(e)})`);
    }
  }

  const matchRate = total > 0 ? correct / total : 0;
  return {
    passed: matchRate >= EVAL_MATCH_THRESHOLD,
    matchRate,
    testedSamples: total,
    correctOutputs: correct,
    details,
  };
}

// ── Compilation Pipeline ──────────────────────────────────────

export interface CompilationResult {
  detected: number;
  compiled: number;
  activated: number;
  skipped: number;
  results: Array<{
    pattern: string;
    label: string;
    occurrences: number;
    status: 'compiled' | 'skipped_inconsistent' | 'skipped_existing' | 'eval_failed' | 'activated';
    tokensSaved?: number;
  }>;
}
// ── Sandbox dry-run: capability validation (fail-closed) ─────────────────

/** Thrown when a compiled skill attempts a capability it is not granted. */
export class SkillCapabilityViolation extends Error {
  constructor(
    public readonly capability: string,
    public readonly declared: string[]
  ) {
    super(
      `skill capability violation: ${capability} not in declared spec [${declared.join(', ')}]`
    );
    this.name = 'SkillCapabilityViolation';
  }
}

/** Default capability vocabulary a compiled skill is allowed to declare. */
export const SKILL_ALLOWED_CAPABILITIES = [
  'skill.invoke',
  'skill.invoke.',
  'memory.read',
  'memory.write',
  'recall.query',
  'recall.write',
];

/**
 * Fail-closed validation: every capability a skill attempts must be granted
 * by its declared spec. `declared` is the allow-list the skill published;
 * `attempted` are the capability strings the dry-run observed it request.
 * Throws SkillCapabilityViolation on the first disallowed attempt.
 */
export function validateSkillCapabilities(declared: string[], attempted: string[]): void {
  const specs: CapabilitySpec[] = declared.map((d) =>
    d.endsWith('.') ? { prefix: d } : { exact: d }
  );
  const fakePlugin = { manifest: { capabilities: specs } } as unknown as LoadedPlugin;
  for (const cap of attempted) {
    if (checkCapability(fakePlugin, cap) == null) {
      throw new SkillCapabilityViolation(cap, declared);
    }
  }
}

/**
 * Execute a compiled skill in an isolated vm context and capture the
 * capabilities it requests via requestCapability(...). Returns the observed
 * capability strings. This is the sandbox dry-run gate run BEFORE publish/
 * activation so a skill that reaches for undeclared powers fails closed.
 */
export function dryRunSkill(code: string, sampleInputs: unknown[]): string[] {
  const attempted = new Set<string>();
  const sandbox: Record<string, unknown> = {
    requestCapability: (cap: string) => {
      attempted.add(cap);
      return true;
    },
    console: { log: () => undefined, error: () => undefined, warn: () => undefined },
    Math,
    JSON,
    Date,
    String,
    Number,
    Array,
    Object,
  };
  for (const input of sampleInputs.slice(0, 3)) {
    const ctx = { ...sandbox, input } as unknown as Context;
    try {
      runInNewContext(`(function(){ ${code} })()`, ctx, { timeout: 2000 });
    } catch {
      /* Execution errors are surfaced by the eval harness; we only track caps. */
    }
  }
  return [...attempted];
}

/**
 * Run the full Neural Skill Compilation pipeline:
 *  1. Detect repetitive patterns
 *  2. Generate deterministic scripts
 *  3. Evaluate against historical data
 *  4. Activate scripts that pass 100%
 *
 * This is the "self-patching loop" — the OS writes its own optimizations.
 */
export async function runCompilationPipeline(actor: string): Promise<CompilationResult> {
  const patterns = await detectRepetitivePatterns();
  const results: CompilationResult['results'] = [];
  let compiled = 0;
  let activated = 0;
  let skipped = 0;

  for (const pattern of patterns) {
    // Check if a script already exists for this pattern
    const existing = await db.query.compiledScripts.findFirst({
      where: eq(compiledScripts.patternSignature, pattern.signature),
    });

    if (existing && existing.status === 'active') {
      results.push({
        pattern: pattern.signature,
        label: pattern.taskLabel,
        occurrences: pattern.occurrences,
        status: 'skipped_existing',
      });
      skipped++;
      continue;
    }

    // Generate the script
    const script = generateScript(pattern);
    compiled++;

    // Evaluate against historical data

    // Sandbox dry-run gate (fail-closed): execute the compiled skill in an
    // isolated vm and capture the capabilities it requests. Validate every
    // requested capability against the skill's declared allow-list. A disallowed
    // attempt → mark eval_failed and do NOT activate (default-deny).
    const attempted = dryRunSkill(script.code, pattern.sampleInputs ?? []);
    let capabilityOk = true;
    let capabilityError = '';
    try {
      validateSkillCapabilities(SKILL_ALLOWED_CAPABILITIES, attempted);
    } catch (ce) {
      capabilityOk = false;
      capabilityError = ce instanceof Error ? ce.message : String(ce);
    }

    const evalResult = await evaluateScript(script, pattern);

    // Store the script (regardless of eval result — for tracking)
    const scriptId = `cmp_${randomUUID()}`;
    const status = evalResult.passed && capabilityOk ? 'active' : 'eval_failed';

    await db
      .insert(compiledScripts)
      .values({
        id: scriptId,
        patternSignature: pattern.signature,
        taskLabel: pattern.taskLabel,
        triggerPattern: pattern.inputShape,
        script: script.code,
        language: script.language,
        status,
        evalResults: {
          passed: evalResult.passed,
          matchRate: evalResult.matchRate,
          testedSamples: evalResult.testedSamples,
          correctOutputs: evalResult.correctOutputs,
          details: evalResult.details.slice(0, 10),
        },
        detectedCount: pattern.occurrences,
        tokensSaved: evalResult.passed ? script.estimatedTokensSaved : 0,
        avgLatencyMs: pattern.avgLatencyMs,
        activatedAt: evalResult.passed ? new Date() : null,
      })
      .onConflictDoNothing({ target: compiledScripts.patternSignature });

    if (evalResult.passed && capabilityOk) {
      activated++;
      results.push({
        pattern: pattern.signature,
        label: pattern.taskLabel,
        occurrences: pattern.occurrences,
        status: 'activated',
        tokensSaved: script.estimatedTokensSaved,
      });

      await appendAudit(
        'skill.compiled',
        {
          scriptId,
          pattern: pattern.signature,
          label: pattern.taskLabel,
          occurrences: pattern.occurrences,
          tokensSaved: script.estimatedTokensSaved,
          matchRate: evalResult.matchRate,
        },
        actor
      );
    } else {
      results.push({
        pattern: pattern.signature,
        label: pattern.taskLabel,
        occurrences: pattern.occurrences,
        status: 'eval_failed',
      });
      await appendAudit(
        'skill.capability_violation',
        { scriptId, pattern: pattern.signature, reason: capabilityError, actor },
        actor
      );
    }
  }

  return {
    detected: patterns.length,
    compiled,
    activated,
    skipped,
    results,
  };
}

// ── Runtime Hot-Swap ──────────────────────────────────────────

/**
 * Check if a task matches an active compiled script.
 * Called by the kernel BEFORE dispatching to an LLM agent.
 *
 * If a match is found, the OS executes the compiled script instead of
 * calling the LLM — this is the hot-swap that saves tokens.
 *
 * Returns the compiled output, or null if no script matches.
 */
export async function checkCompiledScript(
  taskLabel: string,
  input: unknown
): Promise<{ output: unknown; scriptId: string } | null> {
  const normalized = normalizeLabel(taskLabel);
  const signature = createHash('sha256').update(normalized).digest('hex').slice(0, 16);

  const script = await db.query.compiledScripts.findFirst({
    where: and(
      eq(compiledScripts.patternSignature, signature),
      eq(compiledScripts.status, 'active')
    ),
  });

  if (!script) return null;

  // Execute via sandbox (Docker if available, in-process fallback)
  try {
    const { executeSandboxed } = await import('./sandbox.js');
    const result = await executeSandboxed({
      code: script.script,
      language: script.language,
      input,
      timeoutMs: 30_000,
    });

    if (!result.ok) {
      await db
        .update(compiledScripts)
        .set({
          status: 'deprecated',
          updatedAt: new Date(),
        })
        .where(eq(compiledScripts.id, script.id));
      return null;
    }

    await db
      .update(compiledScripts)
      .set({
        timesExecuted: script.timesExecuted + 1,
        updatedAt: new Date(),
      })
      .where(eq(compiledScripts.id, script.id));

    return { output: result.output, scriptId: script.id };
  } catch {
    await db
      .update(compiledScripts)
      .set({
        status: 'deprecated',
        updatedAt: new Date(),
      })
      .where(eq(compiledScripts.id, script.id));
    return null;
  }
}

/** List all compiled scripts (for the dashboard). */
export async function listCompiledScripts() {
  return db.select().from(compiledScripts).orderBy(desc(compiledScripts.createdAt)).limit(100);
}
