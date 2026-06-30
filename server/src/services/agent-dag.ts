/**
 * agent-dag.ts — Multi-Agent DAG via StateGraph composition.
 *
 * Patterns implemented:
 *   - Hierarchical agent composition (agent calls another as tool)
 *   - Subgraph isolation + shared state passing
 *   - DAG execution with topological ordering (Kahn's algorithm)
 *   - Agent-as-tool pattern (wrap agent as callable tool)
 *   - State sharing between agents in DAG
 *   - Subgraph isolation for parallel execution
 *   - Error handling with compensation per subgraph
 *
 * Inspired by: LangGraph subgraph composition, OpenAI SDK AgentTool.
 */
import { randomUUID } from "node:crypto";
import { log } from "../lib/logging.js";
import { appendAudit } from "../lib/audit.js";
import { runAgent, type AgentConfig, type AgentResult } from "./agent-runtime.js";

/* ─── Core Types ─────────────────────────────────────────────────────────── */

export interface DAGNodeConfig {
  agentId: string;
  goal: string;
  actor: string;
  context?: Record<string, unknown>;
  maxIterations?: number;
  timeoutMs?: number;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  /** Compensation action to run if this node fails (subgraph rollback). */
  compensation?: { goal: string; context?: Record<string, unknown> };
  /** Node metadata for observability. */
  metadata?: Record<string, unknown>;
}

export interface DAGNode {
  id: string;
  config: DAGNodeConfig;
  /** Accumulated state from upstream edges. */
  state: Record<string, unknown>;
  /** Cached output after execution. */
  output: unknown;
  /** Execution status. */
  status: "pending" | "running" | "ok" | "failed" | "skipped";
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface DataMapping {
  /** Transform upstream output into this node's context. Keys are context property names, values are JS paths into upstream output. */
  map: Record<string, string>;
  /** Optional transform function name (looked up from registry). */
  transform?: string;
}

export interface EdgeCondition {
  /** JS path expression evaluated against upstream output. */
  test: string;
  /** When true the edge is traversed; when false the downstream node is skipped. */
  expected: unknown;
}

export interface DAGEdge {
  from: string;
  to: string;
  dataMapping?: DataMapping;
  condition?: EdgeCondition;
}

export interface DAGDefinition {
  id: string;
  name: string;
  nodes: Map<string, DAGNode>;
  edges: DAGEdge[];
  config?: DAGConfig;
  compiled: boolean;
  topoOrder: string[][];
}

export interface DAGConfig {
  maxConcurrency?: number;
  failFast?: boolean;
  recordTimeline?: boolean;
}

export interface ExecutionTimelineEntry {
  wave: number;
  nodeId: string;
  status: DAGNode["status"];
  durationMs: number;
  error?: string;
}

export interface ExecutionResult {
  dagId: string;
  ok: boolean;
  nodeResults: Record<string, { status: DAGNode["status"]; output: unknown; error?: string; durationMs: number }>;
  finalState: Record<string, unknown>;
  timeline: ExecutionTimelineEntry[];
  errors: string[];
  durationMs: number;
}

export interface SubgraphDef {
  parentDagId: string;
  nodeIds: string[];
  isolate: boolean;
}

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>, context: { parentAgentId: string; actor: string }) => Promise<{ ok: boolean; output: unknown; error?: string }>;
}

/* ─── Registry ───────────────────────────────────────────────────────────── */

const dagRegistry = new Map<string, DAGDefinition>();
const toolRegistry = new Map<string, AgentTool>();

/* ─── DAG Lifecycle ──────────────────────────────────────────────────────── */

export function createDAG(name: string, config?: DAGConfig): string {
  const id = `dag_${randomUUID().slice(0, 12)}`;
  dagRegistry.set(id, {
    id,
    name,
    nodes: new Map(),
    edges: [],
    config,
    compiled: false,
    topoOrder: [],
  });
  log.info("dag.created", { id, name });
  return id;
}

export function addNode(dagId: string, agentConfig: DAGNodeConfig): string {
  const dag = dagRegistry.get(dagId);
  if (!dag) throw new Error(`dag_not_found:${dagId}`);
  const nodeId = `node_${randomUUID().slice(0, 12)}`;
  dag.nodes.set(nodeId, {
    id: nodeId,
    config: agentConfig,
    state: {},
    output: null,
    status: "pending",
  });
  dag.compiled = false;
  log.info("dag.node_added", { dagId, nodeId, agentId: agentConfig.agentId });
  return nodeId;
}

export function addEdge(
  dagId: string,
  from: string,
  to: string,
  dataMapping?: DataMapping,
  condition?: EdgeCondition,
): void {
  const dag = dagRegistry.get(dagId);
  if (!dag) throw new Error(`dag_not_found:${dagId}`);
  if (!dag.nodes.has(from)) throw new Error(`node_not_found:${from}`);
  if (!dag.nodes.has(to)) throw new Error(`node_not_found:${to}`);
  dag.edges.push({ from, to, dataMapping, condition });
  dag.compiled = false;
  log.info("dag.edge_added", { dagId, from, to });
}

export function compile(dagId: string): string[][] {
  const dag = dagRegistry.get(dagId);
  if (!dag) throw new Error(`dag_not_found:${dagId}`);

  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const nodeId of dag.nodes.keys()) {
    indeg.set(nodeId, 0);
    adj.set(nodeId, []);
  }
  for (const edge of dag.edges) {
    adj.get(edge.from)!.push(edge.to);
    indeg.set(edge.to, (indeg.get(edge.to) ?? 0) + 1);
  }

  const waves: string[][] = [];
  const indegCopy = new Map(indeg);
  let frontier = [...indegCopy.entries()].
    filter(([, d]) => d === 0).
    map(([id]) => id);

  while (frontier.length > 0) {
    waves.push(frontier);
    const next: string[] = [];
    for (const id of frontier) {
      for (const t of adj.get(id) ?? []) {
        const d = (indegCopy.get(t) ?? 0) - 1;
        indegCopy.set(t, d);
        if (d === 0) next.push(t);
      }
    }
    frontier = next;
  }

  const visited = waves.reduce((sum, w) => sum + w.length, 0);
  if (visited !== dag.nodes.size) {
    throw new Error(`dag_cycle_detected:${dagId} (${visited}/${dag.nodes.size} nodes reachable)`);
  }

  dag.topoOrder = waves;
  dag.compiled = true;
  log.info("dag.compiled", { dagId, waves: waves.length });
  return waves;
}

/* ─── State Helpers ──────────────────────────────────────────────────────── */

function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function applyDataMapping(
  upstreamOutput: unknown,
  mapping: DataMapping | undefined,
  existingState: Record<string, unknown>,
): Record<string, unknown> {
  if (!mapping) return existingState;
  const merged = { ...existingState };
  for (const [key, path] of Object.entries(mapping.map)) {
    const value = resolvePath(upstreamOutput, path);
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function evaluateCondition(
  upstreamOutput: unknown,
  condition: EdgeCondition | undefined,
): boolean {
  if (!condition) return true;
  const value = resolvePath(upstreamOutput, condition.test);
  return value === condition.expected;
}

/* ─── Invocation ─────────────────────────────────────────────────────────── */

export async function invoke(
  dagId: string,
  input: Record<string, unknown>,
  actorOverride?: string,
): Promise<ExecutionResult> {
  const dag = dagRegistry.get(dagId);
  if (!dag) throw new Error(`dag_not_found:${dagId}`);

  if (!dag.compiled) compile(dagId);

  const start = Date.now();
  const nodeResults: ExecutionResult["nodeResults"] = {};
  const timeline: ExecutionTimelineEntry[] = [];
  const errors: string[] = [];
  const finalState: Record<string, unknown> = { ...input };

  // Reset all nodes
  for (const node of dag.nodes.values()) {
    node.status = "pending";
    node.state = {};
    node.output = null;
    node.error = undefined;
    node.startedAt = undefined;
    node.finishedAt = undefined;
  }

  await appendAudit("dag.invocation.started", { dagId, name: dag.name, waves: dag.topoOrder.length }, actorOverride ?? "system");

  try {
    for (let waveIdx = 0; waveIdx < dag.topoOrder.length; waveIdx++) {
      const wave: string[] = dag.topoOrder[waveIdx] ?? [];
      const maxConcurrency = dag.config?.maxConcurrency ?? 0;
      const tasks: Promise<void>[] = [];

      for (const nodeId of wave) {
        const node = dag.nodes.get(nodeId)!;

        // Collect upstream outputs, apply data mapping, check conditions
        const incomingEdges = dag.edges.filter((e) => e.to === nodeId);
        let shouldRun = true;

        for (const edge of incomingEdges) {
          const upstreamNode = dag.nodes.get(edge.from);
          if (!upstreamNode) continue;

          if (upstreamNode.status === "failed") {
            // If upstream failed, skip downstream unless condition allows
            const condPass = evaluateCondition(upstreamNode.output, edge.condition);
            if (!condPass) {
              shouldRun = false;
              break;
            }
          }

          // Check conditional edge
          if (!evaluateCondition(upstreamNode.output, edge.condition)) {
            shouldRun = false;
            break;
          }

          // Accumulate state from upstream
          if (edge.dataMapping) {
            node.state = applyDataMapping(upstreamNode.output, edge.dataMapping, node.state);
          } else {
            // Pass full output as named key
            node.state[edge.from] = upstreamNode.output;
          }
        }

        if (!shouldRun) {
          node.status = "skipped";
          nodeResults[nodeId] = { status: "skipped", output: null, durationMs: 0 };
          timeline.push({ wave: waveIdx, nodeId, status: "skipped", durationMs: 0 });
          continue;
        }

        // Merge DAG-level input into node state
        for (const [k, v] of Object.entries(input)) {
          if (!(k in node.state)) node.state[k] = v;
        }

        const execTask = executeNode(dagId, node, waveIdx, actorOverride).then((result) => {
          nodeResults[nodeId] = {
            status: result.status,
            output: result.output,
            error: result.error,
            durationMs: result.durationMs,
          };
          timeline.push({
            wave: waveIdx,
            nodeId,
            status: result.status,
            durationMs: result.durationMs,
            error: result.error,
          });

          if (result.status === "ok") {
            finalState[nodeId] = result.output;
          } else if (result.status === "failed") {
            errors.push(result.error ?? `node_failed:${nodeId}`);
          }
        });

        tasks.push(execTask);

        if (maxConcurrency > 0 && tasks.length >= maxConcurrency) {
          await Promise.race(tasks);
        }
      }

      await Promise.all(tasks);
    }

    // Handle compensation for failed subgraphs
    for (const nodeId of Object.keys(nodeResults)) {
      if (nodeResults[nodeId]?.status === "failed") {
        const node = dag.nodes.get(nodeId);
        if (node?.config.compensation) {
          await runCompensation(dagId, node, actorOverride);
        }
      }
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    errors.push(errMsg);
    await appendAudit("dag.invocation.error", { dagId, error: errMsg }, actorOverride ?? "system");
  }

  const durationMs = Date.now() - start;
  const ok = errors.length === 0;

  await appendAudit("dag.invocation.completed", {
    dagId, name: dag.name, ok, errors: errors.length, durationMs,
  }, actorOverride ?? "system");

  return {
    dagId,
    ok,
    nodeResults,
    finalState,
    timeline,
    errors,
    durationMs,
  };
}

async function executeNode(
  dagId: string,
  node: DAGNode,
  _waveIdx: number,
  actorOverride?: string,
): Promise<{ status: DAGNode["status"]; output: unknown; error?: string; durationMs: number }> {
  const start = Date.now();
  node.status = "running";
  node.startedAt = start;

  try {
    const actor = actorOverride ?? node.config.actor;
    const agentCfg: AgentConfig = {
      agentId: node.config.agentId,
      goal: node.config.goal,
      context: { ...(node.config.context ?? {}), ...node.state },
      maxIterations: node.config.maxIterations ?? 15,
      actor,
    };

    const timeoutMs = node.config.timeoutMs ?? 120000;
    const result = await withTimeout(runAgent(agentCfg), timeoutMs);

    node.output = result;
    node.status = result.ok ? "ok" : "failed";
    node.finishedAt = Date.now();

    if (!result.ok) {
      node.error = result.error ?? "agent returned not ok";
    }

    return {
      status: node.status,
      output: result,
      error: node.error,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    node.status = "failed";
    node.error = errMsg;
    node.finishedAt = Date.now();

    return {
      status: "failed",
      output: null,
      error: errMsg,
      durationMs: Date.now() - start,
    };
  }
}

async function runCompensation(
  dagId: string,
  failedNode: DAGNode,
  actorOverride?: string,
): Promise<void> {
  const comp = failedNode.config.compensation;
  if (!comp) return;

  log.info("dag.compensation.started", {
    dagId, nodeId: failedNode.id, goal: comp.goal,
  });

  try {
    const actor = actorOverride ?? failedNode.config.actor;
    const result = await runAgent({
      agentId: `comp_${failedNode.config.agentId}`,
      goal: comp.goal,
      context: { originalNodeId: failedNode.id, originalError: failedNode.error, ...comp.context },
      maxIterations: 5,
      actor,
    });

    await appendAudit("dag.compensation.completed", {
      dagId, nodeId: failedNode.id, ok: result.ok, answer: result.answer,
    }, actor);
  } catch (e) {
    log.warn("dag.compensation.failed", {
      dagId, nodeId: failedNode.id, error: e instanceof Error ? e.message : String(e),
    });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout_after_${ms}ms`)), ms),
    ),
  ]);
}

/* ─── Subgraph ───────────────────────────────────────────────────────────── */

export function getSubgraph(dagId: string, nodeIds: string[], isolate = true): SubgraphDef {
  const dag = dagRegistry.get(dagId);
  if (!dag) throw new Error(`dag_not_found:${dagId}`);

  for (const nid of nodeIds) {
    if (!dag.nodes.has(nid)) throw new Error(`node_not_found:${nid}`);
  }

  return { parentDagId: dagId, nodeIds, isolate };
}

export async function executeSubgraph(
  subgraph: SubgraphDef,
  input: Record<string, unknown>,
  actorOverride?: string,
): Promise<ExecutionResult> {
  const dag = dagRegistry.get(subgraph.parentDagId);
  if (!dag) throw new Error(`dag_not_found:${subgraph.parentDagId}`);

  if (!dag.compiled) compile(subgraph.parentDagId);

  // Build a mini-DAG from the subgraph node set
  const subNodeIds = new Set(subgraph.nodeIds);
  const subEdges = dag.edges.filter((e) => subNodeIds.has(e.from) && subNodeIds.has(e.to));

  // Sort subgraph nodes topologically
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const nid of subgraph.nodeIds) {
    indeg.set(nid, 0);
    adj.set(nid, []);
  }
  for (const edge of subEdges) {
    adj.get(edge.from)!.push(edge.to);
    indeg.set(edge.to, (indeg.get(edge.to) ?? 0) + 1);
  }

  const waves: string[][] = [];
  const indegCopy = new Map(indeg);
  let frontier = [...indegCopy.entries()].
    filter(([, d]) => d === 0).
    map(([id]) => id);

  while (frontier.length > 0) {
    waves.push(frontier);
    const next: string[] = [];
    for (const id of frontier) {
      for (const t of adj.get(id) ?? []) {
        const d = (indegCopy.get(t) ?? 0) - 1;
        indegCopy.set(t, d);
        if (d === 0) next.push(t);
      }
    }
    frontier = next;
  }

  const start = Date.now();
  const nodeResults: ExecutionResult["nodeResults"] = {};
  const timeline: ExecutionTimelineEntry[] = [];
  const errors: string[] = [];
  const finalState: Record<string, unknown> = { ...input };

    for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
    const wave: string[] = waves[waveIdx] ?? [];
    const tasks = wave.map(async (nodeId) => {
      const node = dag.nodes.get(nodeId)!;

      // Collect only subgraph-relevant upstream
      const incomingEdges = subEdges.filter((e) => e.to === nodeId);
      for (const edge of incomingEdges) {
        const upstreamNode = dag.nodes.get(edge.from);
        if (!upstreamNode) continue;

        if (edge.dataMapping) {
          node.state = applyDataMapping(upstreamNode.output, edge.dataMapping, node.state);
        } else {
          node.state[edge.from] = upstreamNode.output;
        }
      }

      for (const [k, v] of Object.entries(input)) {
        if (!(k in node.state)) node.state[k] = v;
      }

      const result = await executeNode(subgraph.parentDagId, node, waveIdx, actorOverride);
      nodeResults[nodeId] = result;
      timeline.push({
        wave: waveIdx,
        nodeId,
        status: result.status,
        durationMs: result.durationMs,
        error: result.error,
      });

      if (result.status === "ok") {
        finalState[nodeId] = result.output;
      } else {
        errors.push(result.error ?? `node_failed:${nodeId}`);
      }
    });

    await Promise.all(tasks);
  }

  const durationMs = Date.now() - start;
  return {
    dagId: subgraph.parentDagId,
    ok: errors.length === 0,
    nodeResults,
    finalState,
    timeline,
    errors,
    durationMs,
  };
}

/* ─── Agent as Tool ──────────────────────────────────────────────────────── */

export function agentToTool(
  agentId: string,
  name?: string,
  description?: string,
): AgentTool {
  if (toolRegistry.has(agentId)) return toolRegistry.get(agentId)!;

  const tool: AgentTool = {
    id: agentId,
    name: name ?? `agent_${agentId}`,
    description: description ?? `Invoke agent ${agentId} as a sub-task`,
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "The goal to delegate to the agent" },
        context: { type: "object", description: "Additional context for the agent" },
      },
      required: ["goal"],
    },
    execute: async (input, ctx) => {
      const goal = String(input.goal ?? "");
      const context = (input.context ?? {}) as Record<string, unknown>;
      const actor = ctx.actor;

      try {
        const result = await runAgent({
          agentId,
          goal,
          context: { parentAgentId: ctx.parentAgentId, ...context },
          maxIterations: 10,
          actor,
        });

        return {
          ok: result.ok,
          output: result.ok
            ? { answer: result.answer, steps: result.steps, iterations: result.iterations, tokensUsed: result.tokensUsed }
            : { error: result.error, partialAnswer: result.answer },
          error: result.ok ? undefined : result.error,
        };
      } catch (e) {
        return {
          ok: false,
          output: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
  };

  toolRegistry.set(agentId, tool);
  return tool;
}

export function getToolRegistry(): Map<string, AgentTool> {
  return new Map(toolRegistry);
}

/* ─── Utilities ──────────────────────────────────────────────────────────── */

export function getDAG(id: string): DAGDefinition | undefined {
  return dagRegistry.get(id);
}

export function listDAGs(): Array<{ id: string; name: string; nodeCount: number; edgeCount: number; compiled: boolean }> {
  return [...dagRegistry.values()].map((d) => ({
    id: d.id,
    name: d.name,
    nodeCount: d.nodes.size,
    edgeCount: d.edges.length,
    compiled: d.compiled,
  }));
}

export function deleteDAG(id: string): boolean {
  return dagRegistry.delete(id);
}

export function resetDAGRegistry(): void {
  dagRegistry.clear();
  toolRegistry.clear();
}
