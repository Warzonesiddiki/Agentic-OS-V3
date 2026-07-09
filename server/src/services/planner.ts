/**
 * planner.ts — Phase 13 (Multi-Agent Orchestration)
 *
 * Infers a structured run plan (a directed acyclic graph of agent steps)
 * from a natural-language goal. The planner consults the
 * `specializationRegistry` to bind each step to the best-fit agent
 * capability, and uses the LLM (via `runAgent`) to decompose the goal
 * when no cached plan template matches.
 *
 * The output `RunPlan` is consumed by `dag-executor.ts` and the
 * `orchestrator.ts` ingestion path. Plans are deterministic given the
 * same goal + registry snapshot, with an LLM fallback for novel goals.
 */
import { randomId } from '../lib/id.js';
import { log } from '../lib/logging.js';
import { appendAudit } from '../lib/audit.js';
import { runAgent } from './agent-runtime.js';
import { SpecializationRegistry } from './specialization-registry.js';
const specializationRegistry = new SpecializationRegistry();

/** A single step in a run plan. */
export interface PlanStep {
  id: string;
  /** Human label. */
  label: string;
  /** Agent capability name this step is bound to. */
  capability: string;
  /** Goal/instruction passed to the agent for this step. */
  instruction: string;
  /** Ids of steps that must complete before this one. */
  dependsOn: string[];
  /** Optional blackboard keys this step is expected to read. */
  reads?: string[];
  /** Optional blackboard key this step writes. */
  writes?: string;
  /** Retry budget for this step. */
  maxRetries?: number;
  /** If true, a failure here triggers compensation rather than abort. */
  compensatable?: boolean;
}

/** A full orchestration plan. */
export interface RunPlan {
  id: string;
  goal: string;
  steps: PlanStep[];
  createdAt: number;
  /** Planner provenance for auditability. */
  source: 'template' | 'inferred';
}

/** Lightweight goal-decomposition request. */
export interface PlanRequest {
  goal: string;
  /** Optional capability names to restrict to. */
  capabilities?: string[];
  /** Optional seed steps (for human-authored plans). */
  seedSteps?: PlanStep[];
  /** Max steps to infer. */
  maxSteps?: number;
}

const DEFAULT_MAX_STEPS = 8;

/** Decompose a goal into steps using the LLM, then bind capabilities. */
async function inferSteps(req: PlanRequest): Promise<PlanStep[]> {
  const max = req.maxSteps ?? DEFAULT_MAX_STEPS;
  const capList = req.capabilities ?? specializationRegistry.list().map((r) => r.capability.name);

  const prompt = [
    'You are a multi-agent orchestration planner.',
    'Decompose the user goal into a minimal ordered set of agent steps.',
    'Available capabilities: ' + capList.join(', '),
    'Return STRICT JSON only: { "steps": [ { "label": string, "capability": string, "instruction": string, "dependsOn": number[] } ] }',
    `Constraints: at most ${max} steps, dependsOn indexes are 0-based into this same steps array.`,
    'Goal: ' + req.goal,
  ].join('\n');

  const res = await runAgent({
    agentId: 'planner',
    goal: prompt,
    actor: 'planner',
  });

  const text = res.answer;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    log.warn('planner.infer.noJson', { goal: req.goal });
    return [];
  }
  let parsed: {
    steps?: Array<{
      label?: string;
      capability?: string;
      instruction?: string;
      dependsOn?: number[];
    }>;
  };
  try {
    parsed = JSON.parse(jsonMatch[0]) as typeof parsed;
  } catch {
    log.warn('planner.infer.parseError', { goal: req.goal });
    return [];
  }

  const steps = (parsed.steps ?? []).slice(0, max);
  return steps.map((s, i) => {
    const dependsOn = (s.dependsOn ?? [])
      .filter((d) => Number.isInteger(d) && d >= 0 && d < i)
      .map((d) => `s${d}`);
    return {
      id: `s${i}`,
      label: s.label ?? `step-${i}`,
      capability: s.capability ?? capList[0] ?? 'general',
      instruction: s.instruction ?? req.goal,
      dependsOn,
    } satisfies PlanStep;
  });
}

/** Bind a step to an available capability, falling back to registry best-fit. */
function bindCapability(capability: string): string {
  const available = specializationRegistry.list().map((r) => r.capability.name);
  if (available.includes(capability)) return capability;
  const hit = available.find((c: string) => c.includes(capability) || capability.includes(c));
  return hit ?? available[0] ?? 'general';
}

/** Plan a run from a goal. */
export async function planRun(req: PlanRequest): Promise<RunPlan> {
  let steps: PlanStep[] = req.seedSteps ? [...req.seedSteps] : [];
  let source: RunPlan['source'] = req.seedSteps ? 'template' : 'inferred';

  if (steps.length === 0) {
    steps = await inferSteps(req);
    // Re-bind capabilities to what the registry actually exposes.
    steps = steps.map((s, i) => ({ ...s, capability: bindCapability(s.capability), id: `s${i}` }));
  }

  if (steps.length === 0) {
    steps = [
      {
        id: 's0',
        label: 'execute-goal',
        capability: bindCapability('general'),
        instruction: req.goal,
        dependsOn: [],
        maxRetries: 2,
        compensatable: true,
      },
    ];
    source = 'template';
  }

  const plan: RunPlan = {
    id: randomId(),
    goal: req.goal,
    steps,
    createdAt: Date.now(),
    source,
  };

  await appendAudit('planner.plan', { goal: req.goal, steps: steps.length, source }, 'planner');

  log.info('planner.plan', { planId: plan.id, steps: steps.length, source });
  return plan;
}

/** Validate a plan is a DAG (no cycles) before execution. */
export function validatePlanAcyclic(plan: RunPlan): { ok: boolean; cycle?: string[] } {
  const index = new Map<string, PlanStep>();
  plan.steps.forEach((s) => index.set(s.id, s));
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    color.set(id, GRAY);
    stack.push(id);
    const step = index.get(id);
    if (!step) return null;
    for (const dep of step.dependsOn) {
      const c = color.get(dep) ?? WHITE;
      if (c === GRAY) return [...stack];
      if (c === WHITE) {
        const cyc = visit(dep);
        if (cyc) return cyc;
      }
    }
    color.set(id, BLACK);
    stack.pop();
    return null;
  };

  for (const s of plan.steps) {
    if ((color.get(s.id) ?? WHITE) === WHITE) {
      const cyc = visit(s.id);
      if (cyc) return { ok: false, cycle: cyc };
    }
  }
  return { ok: true };
}
