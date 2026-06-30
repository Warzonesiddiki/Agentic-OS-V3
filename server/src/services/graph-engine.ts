/**
 * graph-engine.ts — StateGraph + Checkpointer execution engine.
 *
 * State → Node → Edge → CompiledGraph execution model with:
 *  - Checkpoint state after every superstep
 *  - Resume from any prior checkpoint (time travel)
 *  - State management with structural sharing
 *  - Node execution with error handling and compensation
 *  - Edge routing based on state conditions
 *
 * Source: LangGraph StateGraph, Checkpointer
 */
import { randomUUID } from "node:crypto";
import { log } from "../lib/logging.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type GraphState = Record<string, unknown>;

export type ChannelReducer<T> = (current: T | undefined, incoming: T) => T;

export interface ChannelConfig {
  reducer?: ChannelReducer<unknown>;
  default?: unknown;
}

export type ChannelMap = Record<string, ChannelConfig>;

export type NodeFn<S extends GraphState = GraphState> = (state: S) => Promise<Partial<S> | S | undefined>;

export type ConditionFn<S extends GraphState = GraphState> = (state: S) => string;

export type EdgeMap = Record<string, string>;

export interface Checkpoint {
  threadId: string;
  checkpointId: string;
  parentCheckpointId: string | null;
  state: GraphState;
  node: string | null;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface Checkpointer {
  put(config: CheckpointConfig, checkpoint: Checkpoint): Promise<void>;
  get(config: CheckpointConfig): Promise<Checkpoint | undefined>;
  list(threadId?: string): Promise<Checkpoint[]>;
}

export interface GraphConfig {
  threadId?: string;
  checkpointId?: string;
  recursionLimit?: number;
}

export interface CheckpointConfig {
  threadId: string;
  checkpointId?: string;
}

export interface GraphRunResult<S extends GraphState> {
  state: S;
  steps: GraphStep[];
  threadId: string;
}

export interface GraphStep {
  node: string;
  durationMs: number;
  error?: string;
  compensated?: boolean;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class GraphError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class NodeExecutionError extends GraphError {
  nodeName: string;
  override cause: Error;
  constructor(nodeName: string, cause: Error) {
    super("NODE_ERROR", `Node "${nodeName}" failed: ${cause.message}`);
    this.nodeName = nodeName;
    this.cause = cause;
  }
}

// ─── Structural sharing ─────────────────────────────────────────────────────

function produce(base: GraphState, recipe: Partial<GraphState> | undefined): GraphState {
  if (recipe === undefined) return base;
  let changed = false;
  const keys = new Set([...Object.keys(base), ...Object.keys(recipe)]);
  for (const k of keys) {
    if (base[k] !== recipe[k]) { changed = true; break; }
  }
  return changed ? { ...base, ...recipe } : base;
}

// ─── Internal node / edge ───────────────────────────────────────────────────

interface GraphNode<S extends GraphState = GraphState> {
  name: string;
  fn: NodeFn<S>;
  compensation?: NodeFn<S>;
}

interface UnconditionalEdge {
  type: "unconditional";
  from: string;
  to: string;
}

interface ConditionalEdge<S extends GraphState = GraphState> {
  type: "conditional";
  from: string;
  condition: ConditionFn<S>;
  mappings: EdgeMap;
}

type Edge<S extends GraphState = GraphState> = UnconditionalEdge | ConditionalEdge<S>;

// ─── StateGraph ─────────────────────────────────────────────────────────────

/**
 * A composable state-graph builder. Nodes are connected by edges (unconditional or
 * conditional) and state flows through the graph via reducer-based channels.
 * Call compile() to produce an executable CompiledGraph.
 */
export class StateGraph<S extends GraphState = GraphState> {
  private nodes = new Map<string, GraphNode<S>>();
  private edges: Edge<S>[] = [];
  private channels: ChannelMap = {};
  private entryPoint: string | null = null;

  constructor(spec?: { channels?: ChannelMap }) {
    if (spec?.channels) this.channels = { ...spec.channels };
  }

  addNode(name: string, fn: NodeFn<S>, compensation?: NodeFn<S>): this {
    if (this.nodes.has(name)) throw new GraphError("DUPLICATE_NODE", `Node "${name}" already exists`);
    this.nodes.set(name, { name, fn, compensation });
    if (this.nodes.size === 1) this.entryPoint = name;
    return this;
  }

  addEdge(from: string, to: string): this {
    this.edges.push({ type: "unconditional", from, to });
    return this;
  }

  addConditionalEdges(from: string, condition: ConditionFn<S>, mappings: EdgeMap): this {
    this.edges.push({ type: "conditional", from, condition, mappings });
    return this;
  }

  setEntryPoint(name: string): this {
    if (!this.nodes.has(name)) throw new GraphError("UNKNOWN_NODE", `Entry point "${name}" not found`);
    this.entryPoint = name;
    return this;
  }

  /**
   * Compile the graph into an executable CompiledGraph.
   * Validates all node/edge references before returning.
   */
  compile(checkpointer?: Checkpointer): CompiledGraph<S> {
    if (!this.entryPoint) throw new GraphError("NO_ENTRY", "No entry point — add a node or call setEntryPoint");
    if (this.nodes.size === 0) throw new GraphError("NO_NODES", "No nodes defined");

    const nodeNames = new Set(this.nodes.keys());
    for (const edge of this.edges) {
      if (!nodeNames.has(edge.from)) throw new GraphError("UNKNOWN_NODE", `Edge references unknown node "${edge.from}"`);
      if (edge.type === "unconditional" && !nodeNames.has(edge.to)) {
        throw new GraphError("UNKNOWN_NODE", `Edge references unknown node "${edge.to}"`);
      }
      if (edge.type === "conditional") {
        for (const to of Object.values(edge.mappings)) {
          if (!nodeNames.has(to)) throw new GraphError("UNKNOWN_NODE", `Conditional edge references unknown node "${to}"`);
        }
      }
    }

    return new CompiledGraph<S>({
      nodes: new Map(this.nodes),
      edges: [...this.edges],
      channels: { ...this.channels },
      entryPoint: this.entryPoint,
      checkpointer,
    });
  }
}

// ─── CompiledGraph ──────────────────────────────────────────────────────────

export interface CompiledGraphOptions<S extends GraphState> {
  nodes: Map<string, GraphNode<S>>;
  edges: Edge<S>[];
  channels: ChannelMap;
  entryPoint: string;
  checkpointer?: Checkpointer;
}

/**
 * An executable graph produced by StateGraph.compile().
 * Runs nodes in sequence, routing via edges and saving checkpoints at each superstep.
 */
export class CompiledGraph<S extends GraphState = GraphState> {
  readonly nodes: ReadonlyMap<string, GraphNode<S>>;
  readonly edges: ReadonlyArray<Edge<S>>;
  readonly channels: Readonly<ChannelMap>;
  readonly entryPoint: string;
  readonly checkpointer?: Checkpointer;

  constructor(opts: CompiledGraphOptions<S>) {
    this.nodes = opts.nodes;
    this.edges = opts.edges;
    this.channels = opts.channels;
    this.entryPoint = opts.entryPoint;
    this.checkpointer = opts.checkpointer;
  }

  private getOutgoingEdges(nodeName: string): Edge<S>[] {
    return this.edges.filter((e) => e.from === nodeName);
  }

  private resolveNext(nodeName: string, state: GraphState): string | null {
    const outgoing = this.getOutgoingEdges(nodeName);
    if (outgoing.length === 0) return null;

    const cond = outgoing.find((e): e is ConditionalEdge<S> => e.type === "conditional");
    if (cond) {
      const result = cond.condition(state as S);
      return cond.mappings[result] ?? null;
    }

    return (outgoing[0] as UnconditionalEdge).to;
  }

  private applyChannelReducers(update: Partial<S>, baseState: S): Partial<S> {
    let result = update;
    for (const [key, cfg] of Object.entries(this.channels)) {
      if (cfg.reducer && key in update) {
        result = { ...result, [key]: cfg.reducer(baseState[key], update[key]) };
      }
    }
    return result;
  }

  private async saveCheckpoint(
    threadId: string,
    state: GraphState,
    node: string | null,
    parentCheckpointId: string | null,
    meta: Record<string, unknown>,
  ): Promise<string> {
    if (!this.checkpointer) return "";
    const checkpointId = `cp_${randomUUID()}`;
    await this.checkpointer.put(
      { threadId, checkpointId },
      {
        threadId,
        checkpointId,
        parentCheckpointId,
        state: { ...state },
        node,
        timestamp: Date.now(),
        metadata: meta,
      },
    );
    return checkpointId;
  }

  private async runSuperstep(
    nodeName: string,
    state: GraphState,
    parentCpId: string | null,
    threadId: string,
    stepIndex: number,
  ): Promise<{ nextNode: string | null; nextState: GraphState; step: GraphStep; cpId: string }> {
    const nodeDef = this.nodes.get(nodeName);
    if (!nodeDef) throw new GraphError("UNKNOWN_NODE", `Node "${nodeName}" not found`);

    const start = Date.now();
    let error: string | undefined;
    let compensated = false;
    let nextState: GraphState = state;

    try {
      const update = await nodeDef.fn(nextState as S);
      const reduced = update !== undefined ? this.applyChannelReducers(update as Partial<S>, nextState as S) : {};
      nextState = produce(nextState, reduced);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (nodeDef.compensation) {
        try {
          await nodeDef.compensation(nextState as S);
          compensated = true;
        } catch (ce) {
          log.warn("graph.compensation_failed", { node: nodeName, error: ce instanceof Error ? ce.message : String(ce) });
        }
      }
    }

    const cpId = await this.saveCheckpoint(threadId, nextState, nodeName, parentCpId, {
      step: stepIndex,
      error,
      compensated,
      durationMs: Date.now() - start,
    });

    const step: GraphStep = {
      node: nodeName,
      durationMs: Date.now() - start,
      error,
      compensated,
    };

    const nextNode = error ? null : this.resolveNext(nodeName, nextState);
    return { nextNode, nextState, step, cpId };
  }

  /**
   * Execute the graph from the entry point with the given input state.
   * Supports time-travel resume from a prior checkpoint if checkpointId is provided.
   */
  async invoke(input: S, config?: GraphConfig): Promise<GraphRunResult<S>> {
    const threadId = config?.threadId ?? randomUUID();
    const recursionLimit = config?.recursionLimit ?? 25;
    const steps: GraphStep[] = [];
    let currentState: GraphState = input;
    let parentCpId: string | null = null;
    let currentNode: string | null = this.entryPoint;

    // Time-travel resume: load a prior checkpoint and derive the resume node
    if (config?.checkpointId && this.checkpointer) {
      const cp = await this.checkpointer.get({ threadId, checkpointId: config.checkpointId });
      if (cp) {
        currentState = cp.state;
        parentCpId = cp.checkpointId;
        if (cp.node) {
          currentNode = this.resolveNext(cp.node, currentState);
        }
      }
    }

    for (let i = 0; i < recursionLimit; i++) {
      if (!currentNode) break;

      const result = await this.runSuperstep(currentNode, currentState, parentCpId, threadId, steps.length);
      steps.push(result.step);
      currentState = result.nextState;
      parentCpId = result.cpId;
      currentNode = result.nextNode;
    }

    return { state: currentState as S, steps, threadId };
  }

  async getState(config: { threadId: string; checkpointId?: string }): Promise<S | undefined> {
    if (!this.checkpointer) return undefined;
    const cp = await this.checkpointer.get(config);
    return cp?.state as S | undefined;
  }

  async getStateHistory(config: { threadId: string }): Promise<Checkpoint[]> {
    if (!this.checkpointer) return [];
    const all = await this.checkpointer.list(config.threadId);
    return all.sort((a, b) => a.timestamp - b.timestamp);
  }
}

// ─── InMemoryCheckpointer ───────────────────────────────────────────────────

export class InMemoryCheckpointer implements Checkpointer {
  private store = new Map<string, Checkpoint>();

  async put(_config: CheckpointConfig, checkpoint: Checkpoint): Promise<void> {
    const key = `${checkpoint.threadId}:${checkpoint.checkpointId}`;
    this.store.set(key, checkpoint);
  }

  async get(config: CheckpointConfig): Promise<Checkpoint | undefined> {
    if (config.checkpointId) return this.store.get(`${config.threadId}:${config.checkpointId}`);
    const all = this.store.values();
    let latest: Checkpoint | undefined;
    for (const cp of all) {
      if (cp.threadId === config.threadId && (!latest || cp.timestamp > latest.timestamp)) {
        latest = cp;
      }
    }
    return latest;
  }

  async list(threadId?: string): Promise<Checkpoint[]> {
    const all = Array.from(this.store.values());
    const filtered = threadId ? all.filter((c) => c.threadId === threadId) : all;
    return filtered.sort((a, b) => a.timestamp - b.timestamp);
  }

  clear(): void {
    this.store.clear();
  }
}
