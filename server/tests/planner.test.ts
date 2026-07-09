import { describe, it, expect, vi, beforeEach } from "vitest";

const appendAudit = vi.fn(async () => {});
vi.mock("../src/lib/audit.js", () => ({
  appendAudit: (...a: unknown[]) => appendAudit(...a),
}));
vi.mock("../src/lib/logging.js", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../src/services/agent-runtime.js", () => ({
  // No usable JSON -> inferSteps yields [], planner falls back to a generic step.
  runAgent: async () => ({ answer: "no usable json here" }),
}));

import { planRun, validatePlanAcyclic } from "../src/services/planner.js";
import type { PlanStep, RunPlan } from "../src/services/planner.js";

function step(id: string, dependsOn: string[] = []): PlanStep {
  return { id, label: id, capability: "general", instruction: "do", dependsOn };
}

describe("validatePlanAcyclic", () => {
  it("accepts an empty plan", () => {
    expect(validatePlanAcyclic({ id: "p", goal: "g", steps: [], createdAt: 0, source: "template" }).ok).toBe(true);
  });

  it("accepts a linear DAG", () => {
    const plan: RunPlan = {
      id: "p",
      goal: "g",
      createdAt: 0,
      source: "template",
      steps: [step("s0"), step("s1", ["s0"]), step("s2", ["s1"])],
    };
    expect(validatePlanAcyclic(plan).ok).toBe(true);
  });

  it("detects a simple cycle", () => {
    const plan: RunPlan = {
      id: "p",
      goal: "g",
      createdAt: 0,
      source: "template",
      steps: [step("s0", ["s1"]), step("s1", ["s0"])],
    };
    const res = validatePlanAcyclic(plan);
    expect(res.ok).toBe(false);
    expect(res.cycle).toBeDefined();
    expect(res.cycle!.sort()).toEqual(["s0", "s1"].sort());
  });

  it("detects a longer cycle", () => {
    const plan: RunPlan = {
      id: "p",
      goal: "g",
      createdAt: 0,
      source: "template",
      steps: [step("a", ["c"]), step("b", ["a"]), step("c", ["b"])],
    };
    const res = validatePlanAcyclic(plan);
    expect(res.ok).toBe(false);
    expect(res.cycle!.length).toBeGreaterThanOrEqual(3);
  });

  it("accepts diamond dependencies", () => {
    const plan: RunPlan = {
      id: "p",
      goal: "g",
      createdAt: 0,
      source: "template",
      steps: [step("a"), step("b", ["a"]), step("c", ["a"]), step("d", ["b", "c"])],
    };
    expect(validatePlanAcyclic(plan).ok).toBe(true);
  });
});

describe("planRun", () => {
  beforeEach(() => appendAudit.mockClear());

  it("uses seedSteps as a template plan", async () => {
    const plan = await planRun({ goal: "g", seedSteps: [step("s0"), step("s1", ["s0"])] });
    expect(plan.source).toBe("template");
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[1].dependsOn).toEqual(["s0"]);
  });

  it("falls back to a single generic step when no steps and no inference", async () => {
    // With no seedSteps and no matching registry capabilities, inferSteps yields []
    // (runAgent is mocked to return no JSON), so planner falls back to a generic step.
    const plan = await planRun({ goal: "do something" });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].capability).toBe("general");
    expect(appendAudit).toHaveBeenCalled();
  });
});
