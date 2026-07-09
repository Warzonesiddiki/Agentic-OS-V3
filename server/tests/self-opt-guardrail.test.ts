/**
 * GuardrailGuard layer tests (Phase 18 safe-exploration spine). In-memory, no DB.
 */
import { describe, it, expect } from "vitest";
import { GuardrailGuard } from "../src/services/self-opt/guardrail-guard.js";
import type { TunerDelta } from "../src/services/self-opt/guardrail-guard.js";

function delta(over: Partial<TunerDelta> = {}): TunerDelta {
  return {
    tunerId: "18.1",
    targetInterface: "scheduler.ts:setPidGain",
    ownerAgent: "forge",
    beforeJson: { kp: 1 },
    afterJson: { kp: 1.1 },
    reason: "improve queue wait",
    expectedEffect: "lower wait_ms",
    ...over,
  } as TunerDelta;
}

describe("GuardrailGuard — evaluation", () => {
  it("allows a normal delta; dry-run default yields shadow window 0 (no live apply)", () => {
    const g = new GuardrailGuard({ dryRunDefault: true });
    const d = g.evaluate(delta());
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.shadowWindowSeconds).toBe(0);
  });

  it("L2 circuit breaker blocks all writes when open", () => {
    const g = new GuardrailGuard({ dryRunDefault: false });
    g.tripCircuitBreaker(60_000);
    const d = g.evaluate(delta());
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.layer).toBe("L2_CIRCUIT");
  });

  it("L0 global budget exhaustion blocks", () => {
    const g = new GuardrailGuard({ dryRunDefault: false, maxWriteApplyPerDay: 1 });
    expect(g.evaluate(delta()).allowed).toBe(true); // first consumes budget
    const second = g.evaluate(delta());
    expect(second.allowed).toBe(false);
    if (!second.allowed) expect(second.layer).toBe("L0_BUDGET");
  });

  it("L4 fairness guard blocks cohort regression", () => {
    const g = new GuardrailGuard({ dryRunDefault: false, fairnessMinDelta: 0 });
    const d = g.evaluate(delta({ cohortMetrics: { latency: -0.05 } }));
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.layer).toBe("L4_FAIRNESS");
  });

  it("L5 explainability blocks missing reason", () => {
    const g = new GuardrailGuard({ dryRunDefault: false });
    const d = g.evaluate(delta({ reason: "", expectedEffect: "" }));
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.layer).toBe("L5_EXPLAIN");
  });

  it("L6 satisfaction loop blocks negative signal", () => {
    const g = new GuardrailGuard({ dryRunDefault: false });
    g.recordSatisfaction("18.1", -1);
    const d = g.evaluate(delta());
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.layer).toBe("L6_SATISFACTION");
  });

  it("dry-run is always allowed and never consumes budget", () => {
    const g = new GuardrailGuard({ dryRunDefault: true, maxWriteApplyPerDay: 0 });
    const d = g.evaluate(delta());
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.shadowWindowSeconds).toBe(0);
  });

  it("cost kill-switch triggers at/above threshold", () => {
    const g = new GuardrailGuard({ costKillSwitchUsdPer1k: 0.01 });
    expect(g.checkCostKillSwitch(0.01)).toBe(true);
    expect(g.checkCostKillSwitch(0.005)).toBe(false);
  });
});
