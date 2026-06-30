/**
 * pipeline-executor.ts
 * ────────────────────
 * Pillar V of the 100× upgrade.
 *
 * Interprets a user-authored DAG (nodes + edges) saved in the `pipelines`
 * table. Each node has a `type` and `config`. Supported node types:
 *
 *   - "trigger.manual"  — no-op, just produces an empty input
 *   - "agent.run"       — runs a named agent with `messages` from inputs
 *   - "tool.invoke"     — invokes a sandboxed tool (HTTP, shell, file read)
 *   - "guardrail.check" — runs a regex/schema check; fails the branch
 *   - "output.sink"     — collects the final result into the pipeline run
 *
 * Execution model: topologically sort the DAG, then run nodes in waves,
 * passing each node's outputs as inputs to downstream nodes keyed by edge id.
 * Cycles are rejected at save time (we validate acyclic on insert).
 */
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { pipelines, pipelineRuns } from "../db/schema-v3-100x.js";
import { eq } from "drizzle-orm";
import { appendAudit } from "../lib/audit.js";
import { log } from "../lib/logging.js";

/* ─── DAG types ──────────────────────────────────────────────────────────── */

export type NodeType =
  | "trigger.manual"
  | "agent.run"
  | "tool.invoke"
  | "guardrail.check"
  | "output.sink";

export interface PipelineNode {
  id: string;
  type: NodeType;
  /** Position in the visual builder (px). */
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface PipelineEdge {
  from: string;
  to: string;
  /** Optional port label. */
  fromPort?: string;
  toPort?: string;
}

export interface PipelineDAG {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

export interface PipelineRunRequest {
  pipelineId: string;
  triggeredBy?: string;
  inputs?: Record<string, unknown>;
}

export interface PipelineRunResult {
  runId: string;
  status: "succeeded" | "failed" | "cancelled";
  durationMs: number;
  nodeResults: Record<string, { status: "ok" | "failed" | "skipped"; output: unknown; error?: string }>;
  error?: string;
}

/* ─── Validation (acyclic, single trigger, all edges resolve) ────────────── */

export function validateDAG(dag: PipelineDAG): { ok: true } | { ok: false; reason: string } {
  if (dag.nodes.length === 0) return { ok: false, reason: "empty_dag" };
  const ids = new Set(dag.nodes.map((n) => n.id));
  for (const e of dag.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) return { ok: false, reason: `dangling_edge:${e.from}->${e.to}` };
  }
  const triggers = dag.nodes.filter((n) => n.type === "trigger.manual");
  if (triggers.length > 1) return { ok: false, reason: "multiple_triggers" };
  // Cycle detection (Kahn's algorithm)
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of dag.nodes) { indeg.set(n.id, 0); adj.set(n.id, []); }
  for (const e of dag.edges) {
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, d] of indeg) if (d === 0) queue.push(id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited++;
    for (const next of adj.get(id) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (visited !== dag.nodes.length) return { ok: false, reason: "cycle_detected" };
  return { ok: true };
}

/* ─── Save ───────────────────────────────────────────────────────────────── */

export async function savePipeline(input: {
  id?: string;
  name: string;
  description?: string;
  dag: PipelineDAG;
  trigger?: Record<string, unknown>;
  author?: string;
}): Promise<string> {
  const v = validateDAG(input.dag);
  if (!v.ok) throw new Error(`pipeline_invalid:${v.reason}`);
  const id = input.id ?? `pipe_${randomUUID()}`;
  await db.insert(pipelines).values({
    id,
    name: input.name,
    description: input.description ?? "",
    dag: input.dag as unknown as Record<string, unknown>,
    trigger: (input.trigger ?? {}) as Record<string, unknown>,
    enabled: true,
    author: input.author ?? "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: pipelines.id,
    set: { dag: input.dag as unknown as Record<string, unknown>, name: input.name, description: input.description ?? "", updatedAt: new Date() },
  });
  await appendAudit("pipeline.saved", { id, name: input.name, nodeCount: input.dag.nodes.length, edgeCount: input.dag.edges.length }, input.author ?? "user");
  return id;
}

/* ─── Execute ────────────────────────────────────────────────────────────── */

export async function runPipeline(req: PipelineRunRequest): Promise<PipelineRunResult> {
  const row = await db.query.pipelines.findFirst({ where: eq(pipelines.id, req.pipelineId) });
  if (!row) throw new Error(`pipeline_not_found:${req.pipelineId}`);
  if (!row.enabled) throw new Error(`pipeline_disabled:${req.pipelineId}`);

  const dag = row.dag as unknown as PipelineDAG;
  const runId = `prun_${randomUUID()}`;
  const start = Date.now();
  await db.insert(pipelineRuns).values({
    id: runId,
    pipelineId: req.pipelineId,
    status: "running",
    startedAt: new Date(),
    nodeResults: {},
    triggeredBy: req.triggeredBy ?? "manual",
    createdAt: new Date(),
  });

  const nodeResults: PipelineRunResult["nodeResults"] = {};
  const outputs = new Map<string, unknown>(Object.entries(req.inputs ?? {}));
  let runError: string | undefined;

  try {
    const waves = topoWaves(dag);
    for (const wave of waves) {
      await Promise.all(wave.map(async (nodeId) => {
        const node = dag.nodes.find((n) => n.id === nodeId)!;
        // collect upstream outputs
        const upstream = dag.edges
          .filter((e) => e.to === nodeId)
          .map((e) => outputs.get(e.from))
          .filter((v) => v !== undefined);
        try {
          const out = await executeNode(node, upstream);
          outputs.set(nodeId, out);
          nodeResults[nodeId] = { status: "ok", output: out };
        } catch (e) {
          nodeResults[nodeId] = { status: "failed", output: null, error: e instanceof Error ? e.message : String(e) };
          throw e;
        }
      }));
    }
  } catch (e) {
    runError = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - start;
  const status: PipelineRunResult["status"] = runError ? "failed" : "succeeded";

  await db.update(pipelineRuns)
    .set({ status, finishedAt: new Date(), durationMs, nodeResults: nodeResults as Record<string, unknown>, error: runError ?? null })
    .where(eq(pipelineRuns.id, runId));

  await appendAudit("pipeline.run_completed", { runId, pipelineId: req.pipelineId, status, durationMs, error: runError }, req.triggeredBy ?? "manual");
  log.info("pipeline.run_completed", { runId, status, durationMs });
  return { runId, status, durationMs, nodeResults, error: runError };
}

function topoWaves(dag: PipelineDAG): string[][] {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of dag.nodes) { indeg.set(n.id, 0); adj.set(n.id, []); }
  for (const e of dag.edges) {
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const waves: string[][] = [];
  let frontier = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  while (frontier.length) {
    waves.push(frontier);
    const next: string[] = [];
    for (const id of frontier) {
      for (const t of adj.get(id) ?? []) {
        const d = (indeg.get(t) ?? 0) - 1;
        indeg.set(t, d);
        if (d === 0) next.push(t);
      }
    }
    frontier = next;
  }
  return waves;
}

/* ─── Node executors ─────────────────────────────────────────────────────── */

async function executeNode(node: PipelineNode, inputs: unknown[]): Promise<unknown> {
  switch (node.type) {
    case "trigger.manual":
      return inputs[0] ?? {};
    case "agent.run": {
      const agentId = String(node.config.agentId ?? "");
      const messages = Array.isArray(inputs[0]) ? inputs[0] as Array<{ role: string; content: string }> : [];
      const { callLLMGateway } = await import("./llm-gateway-v2.js");
      const resp = await callLLMGateway({
        sessionId: `pipeline:${agentId}:${randomUUID().slice(0, 8)}`,
        policy: { preferred: ["m3", "anthropic", "openai", "google", "ollama", "vllm"] },
        request: { model: String(node.config.model ?? "m3-reasoning"), messages: messages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })) },
      });
      return { text: resp.text, tokens: resp.totalTokens };
    }
    case "tool.invoke": {
      // Stub: real impl wires to the sandboxed tool registry; for now pass-through.
      return { tool: String(node.config.tool ?? ""), inputs };
    }
    case "guardrail.check": {
      const pattern = String(node.config.pattern ?? "");
      const flags = String(node.config.flags ?? "");
      const re = new RegExp(pattern, flags);
      const text = String(inputs[0] ?? "");
      if (!re.test(text)) throw new Error(`guardrail_failed:${pattern}`);
      return { ok: true };
    }
    case "output.sink":
      return inputs[0] ?? null;
    default: {
      const _exhaustive: never = node.type;
      throw new Error(`unknown_node_type:${String(_exhaustive)}`);
    }
  }
}

/* ─── List runs (for the UI) ────────────────────��───────────────────────── */

export async function listPipelineRuns(pipelineId: string, limit = 50) {
  const { desc } = await import("drizzle-orm");
  return db.query.pipelineRuns.findMany({
    where: eq(pipelineRuns.pipelineId, pipelineId),
    orderBy: [desc(pipelineRuns.createdAt)],
    limit,
  });
}

export async function listPipelines() {
  return db.query.pipelines.findMany({});
}