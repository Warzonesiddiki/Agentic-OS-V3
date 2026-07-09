/**
 * Gap-item meta-surface tests (Phase 18). Pure / guard-only — no database.
 */
import { describe, it, expect } from "vitest";
import { GuardrailGuard } from "../src/services/self-opt/guardrail-guard.js";
import {
  powerCalculator,
  generateHypothesis,
  fairnessCheck,
  explorationBudgetStatus,
  costKillSwitch,
  metaOptimize,
} from "../src/services/self-opt/gap-items.js";

function fakeController() {
  const guard = new GuardrailGuard();
  return { guard } as any;
}

describe("gap-items — pure surfaces", () => {
  it("powerCalculator returns a positive per-arm sample size", () => {
    const r = powerCalculator();
    expect(r.nPerArm).toBeGreaterThan(0);
    expect(r.alpha).toBe(0.05);
    expect(r.power).toBe(0.8);
  });

  it("generateHypothesis picks the worst metric", () => {
    const h = generateHypothesis({ latency: 0.9, error_rate: 0.2, cost: 0.5 });
    expect(h).toContain("latency");
  });

  it("generateHypothesis reports no degradation when empty", () => {
    expect(generateHypothesis({})).toContain("No degradation");
  });

  it("fairnessCheck flags regressing cohorts", () => {
    const c = fakeController();
    const res = fairnessCheck(c, { latency: -0.1, cost: 0.05 });
    expect(res.ok).toBe(false);
    expect(res.violating).toContain("latency");
  });

  it("fairnessCheck passes when all cohorts non-negative", () => {
    const c = fakeController();
    expect(fairnessCheck(c, { latency: 0.1 }).ok).toBe(true);
  });

  it("explorationBudgetStatus exposes used/cap", () => {
    const c = fakeController();
    const s = explorationBudgetStatus(c);
    expect(s.globalCap).toBeGreaterThan(0);
    expect(s.globalUsed).toBe(0);
  });

  it("costKillSwitch reflects threshold", () => {
    const c = fakeController();
    expect(costKillSwitch(c, 0.02)).toBe(true);
    expect(costKillSwitch(c, 0.001)).toBe(false);
  });

  it("metaOptimize does not throw", () => {
    const c = fakeController();
    expect(() => metaOptimize(c, { significanceAlpha: 0.01 })).not.toThrow();
  });
});
