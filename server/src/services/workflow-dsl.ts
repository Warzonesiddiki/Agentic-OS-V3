/**
 * workflow-dsl.ts — Phase 13.4 YAML Workflow DSL -> DAG compiler (PURE).
 *
 * Parses the declarative workflow DSL into a validated, topologically ordered
 * CompiledWorkflow. Performs cycle detection (Kahn's algorithm) and rejects
 * DAGs with cycles or dangling dependencies. Does NOT execute anything — the
 * orchestrator core (Phase 13) consumes CompiledWorkflow to drive execution.
 *
 * Pure: depends only on zod + the merge/router/consensus strategy types in
 * this services folder. No kernel / scheduler / message-bus imports.
 */
import { z } from 'zod';
import { log } from '../lib/logging.js';
import { MergeStrategySchema, type MergeStrategy } from './merge-strategies.js';
import { RouteRuleSchema } from './conditional-router.js';

export const GateSchema = z.enum(['hitl', 'validate']);
export type Gate = z.infer<typeof GateSchema>;

export const OnErrorSchema = z.enum(['compensate', 'retry', 'fail']);
export type OnError = z.infer<typeof OnErrorSchema>;

export const WorkflowStepSchema = z
  .object({
    id: z.string().min(1),
    do: z.string().min(1),
    depends: z.array(z.string().min(1)).default([]),
    inputs: z.record(z.string(), z.unknown()).default({}),
    gate: GateSchema.optional(),
    validateSchema: z.record(z.string(), z.unknown()).optional(),
    merge: MergeStrategySchema.optional(),
    router: z.array(RouteRuleSchema).optional(),
    onError: OnErrorSchema.default('fail'),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict();
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowDSLSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1),
    env: z.record(z.string(), z.unknown()).default({}),
    steps: z.array(WorkflowStepSchema).min(1),
    merge: MergeStrategySchema.default('concat'),
  })
  .strict();
export type WorkflowDSL = z.infer<typeof WorkflowDSLSchema>;

export interface CompiledWorkflow {
  name: string;
  version: number;
  env: Record<string, unknown>;
  steps: WorkflowStep[];
  defaultMerge: MergeStrategy;
  /** topological order of step ids (ready-first). */
  order: string[];
  /** adjacency: stepId -> downstream stepIds. */
  edges: Map<string, string[]>;
}

/** Compile a DSL object (already-parsed YAML) into a validated DAG. */
export function compileWorkflow(dsl: unknown): CompiledWorkflow {
  const parsed = WorkflowDSLSchema.parse(dsl);
  const byId = new Map(parsed.steps.map((s) => [s.id, s]));

  // Validate dependencies reference real steps.
  for (const s of parsed.steps) {
    for (const dep of s.depends) {
      if (!byId.has(dep)) {
        throw new Error(`step "${s.id}" depends on unknown step "${dep}"`);
      }
    }
  }

  // Build adjacency (dep -> dependents).
  const edges = new Map<string, string[]>();
  for (const s of parsed.steps) edges.set(s.id, []);
  for (const s of parsed.steps) {
    for (const dep of s.depends) edges.get(dep)!.push(s.id);
  }

  const order = topoSort(
    parsed.steps.map((s) => s.id),
    (id) => byId.get(id)!.depends,
    edges
  );
  log.info('workflow.compiled', {
    name: parsed.name,
    steps: parsed.steps.length,
    order: order.length,
  });
  return {
    name: parsed.name,
    version: parsed.version,
    env: parsed.env,
    steps: parsed.steps,
    defaultMerge: parsed.merge,
    order,
    edges,
  };
}

/** Kahn's algorithm; throws on cycle. */
function topoSort(
  ids: string[],
  depsOf: (id: string) => string[],
  edges: Map<string, string[]>
): string[] {
  const indeg = new Map(ids.map((id) => [id, depsOf(id).length]));
  const queue = ids.filter((id) => indeg.get(id) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of edges.get(id) ?? []) {
      const d = indeg.get(next)! - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (order.length !== ids.length) {
    throw new Error('workflow DAG has a cycle (topological sort incomplete)');
  }
  return order;
}
