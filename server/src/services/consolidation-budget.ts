// server/src/services/consolidation-budget.ts
//
// 0/1 knapsack selector that promotes the highest-importance memories within a
// token budget. Memories that do not fit are archived.

export interface ConsolidationMemory {
  id: string;
  importance: number;
  tokens: number;
}

export interface ConsolidationPlan {
  promote: ConsolidationMemory[];
  archive: ConsolidationMemory[];
  totalTokens: number;
  usedTokens: number;
  remainingTokens: number;
}

const WEIGHT_EPSILON = 1e-9;

export function selectForConsolidation(
  memories: ConsolidationMemory[],
  tokenBudget: number
): ConsolidationPlan {
  const budget = Math.max(0, Math.floor(tokenBudget));

  if (memories.length === 0) {
    return {
      promote: [],
      archive: [],
      totalTokens: 0,
      usedTokens: 0,
      remainingTokens: budget,
    };
  }

  const weights: number[] = memories.map((m) => Math.max(0, Math.floor(m.tokens)));
  const totalTokens = weights.reduce((acc, w) => acc + w, 0);
  const capacity = Math.max(0, Math.min(budget, Math.ceil(totalTokens)));

  const n = memories.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(capacity + 1).fill(0)
  );

  for (let i = 1; i <= n; i++) {
    const weight = weights[i - 1] ?? 0;
    const value = memories[i - 1]?.importance ?? 0;
    const prev = dp[i - 1];
    const curr = dp[i];
    if (prev === undefined || curr === undefined) continue;
    for (let c = 0; c <= capacity; c++) {
      const without = prev[c] ?? 0;
      const withItem = weight <= c ? (prev[c - weight] ?? 0) + value : Number.NEGATIVE_INFINITY;
      curr[c] = Math.max(without, withItem);
    }
  }

  const selected = new Array<boolean>(n).fill(false);
  let remaining = capacity;
  for (let i = n; i >= 1; i--) {
    const prev = dp[i - 1];
    const curr = dp[i];
    if (prev === undefined || curr === undefined) continue;
    const diff = (curr[remaining] ?? 0) - (prev[remaining] ?? 0);
    if (diff > WEIGHT_EPSILON) {
      selected[i - 1] = true;
      remaining -= weights[i - 1] ?? 0;
    }
  }

  const promote: ConsolidationMemory[] = [];
  const archive: ConsolidationMemory[] = [];
  let usedTokens = 0;
  for (let i = 0; i < n; i++) {
    const mem = memories[i];
    if (mem === undefined) continue;
    if (selected[i]) {
      promote.push(mem);
      usedTokens += weights[i] ?? 0;
    } else {
      archive.push(mem);
    }
  }

  return {
    promote,
    archive,
    totalTokens,
    usedTokens,
    remainingTokens: Math.max(0, budget - usedTokens),
  };
}
