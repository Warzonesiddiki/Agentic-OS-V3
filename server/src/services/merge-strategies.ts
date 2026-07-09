/**
 * merge-strategies.ts — Phase 13.14 output merge strategies (PURE, no kernel deps).
 *
 * Given the outputs of parallel/branched step executions, produce a single
 * merged value for downstream consumption. `llmMerge` is intentionally a typed
 * placeholder: real merging needs the LLM router, which is wired by the orchestrator
 * core (Phase 13 + 18), not this pure module.
 */
import { z } from 'zod';
import { log } from '../lib/logging.js';

export const MergeStrategySchema = z.enum([
  'concat',
  'first-wins',
  'majority',
  'llm-merge',
  'schema-union',
]);
export type MergeStrategy = z.infer<typeof MergeStrategySchema>;

export interface MergeInput {
  stepId: string;
  value: unknown;
}

/** concat — array/string concatenation of all branch outputs. */
export function mergeConcat(items: MergeInput[]): unknown {
  if (items.length === 0) return [];
  const allArrays = items.every((i) => Array.isArray(i.value));
  if (allArrays) return items.flatMap((i) => i.value as unknown[]);
  const allStrings = items.every((i) => typeof i.value === 'string');
  if (allStrings) return items.map((i) => i.value as string).join('\n');
  // Mixed: wrap each in {stepId, value}
  return items.map((i) => ({ stepId: i.stepId, value: i.value }));
}

/** first-wins — return the first non-null branch output (stable order). */
export function mergeFirstWins(items: MergeInput[]): unknown {
  for (const i of items) {
    if (i.value !== null && i.value !== undefined) return i.value;
  }
  return undefined;
}

/** majority — most frequent value; ties return the first-seen majority. */
export function mergeMajority(items: MergeInput[]): unknown {
  const counts = new Map<string, { value: unknown; n: number }>();
  for (const i of items) {
    const key = stableStringify(i.value);
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else counts.set(key, { value: i.value, n: 1 });
  }
  let best: { value: unknown; n: number } | undefined;
  for (const entry of counts.values()) {
    if (!best || entry.n > best.n) best = entry;
  }
  return best?.value;
}

/** schema-union — merge object outputs key-by-key, arrays unioned uniquely. */
export function mergeSchemaUnion(items: MergeInput[]): unknown {
  const result: Record<string, unknown> = {};
  for (const i of items) {
    const v = i.value;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (Array.isArray(val)) {
          const base = Array.isArray(result[k]) ? (result[k] as unknown[]) : [];
          result[k] = uniqueConcat(base, val);
        } else if (result[k] === undefined) {
          result[k] = val;
        }
      }
    } else {
      result[i.stepId] = v;
    }
  }
  return result;
}

/**
 * llmMerge — needs the LLM router; this pure module only validates the call
 * shape and delegates. The orchestrator core supplies `runLlmMerge`.
 */
export type LlmMergeFn = (items: MergeInput[], instruction?: string) => Promise<unknown>;
export async function mergeWithLlm(
  items: MergeInput[],
  runLlmMerge: LlmMergeFn,
  instruction?: string
): Promise<unknown> {
  if (items.length === 0) return undefined;
  log.debug('merge.llm', { branches: items.length });
  return runLlmMerge(items, instruction);
}

/** Dispatch by strategy name. `llm-merge` requires the async variant. */
export function mergeBy(strategy: MergeStrategy, items: MergeInput[]): unknown {
  switch (strategy) {
    case 'concat':
      return mergeConcat(items);
    case 'first-wins':
      return mergeFirstWins(items);
    case 'majority':
      return mergeMajority(items);
    case 'schema-union':
      return mergeSchemaUnion(items);
    case 'llm-merge':
      throw new Error('llm-merge requires mergeWithLlm (async, needs LLM router)');
  }
}

function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object'
      ? Object.keys(val)
          .sort()
          .reduce((o, k) => ((o[k] = (val as Record<string, unknown>)[k]), o), {} as Record<string, unknown>)
      : val
  );
}
function uniqueConcat(a: unknown[], b: unknown[]): unknown[] {
  const seen = new Set(a.map(stableStringify));
  const out = [...a];
  for (const x of b) {
    const k = stableStringify(x);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}
