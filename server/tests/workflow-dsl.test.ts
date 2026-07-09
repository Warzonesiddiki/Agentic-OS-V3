import { describe, it, expect, vi } from "vitest";

vi.mock("../src/lib/logging.js", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  compileWorkflow,
  WorkflowDSLSchema,
  WorkflowStepSchema,
  GateSchema,
  OnErrorSchema,
} from "../src/services/workflow-dsl.js";

const baseStep = (id: string, depends: string[] = []) => ({ id, do: `act-${id}`, depends });

describe("compileWorkflow — schema validation", () => {
  it("accepts a minimal valid DSL and applies defaults", () => {
    const cw = compileWorkflow({
      version: 1,
      name: "wf",
      steps: [baseStep("a")],
    });
    expect(cw.name).toBe("wf");
    expect(cw.version).toBe(1);
    expect(cw.defaultMerge).toBe("concat");
    expect(cw.env).toEqual({});
  });

  it("rejects non-literal version", () => {
    expect(() => compileWorkflow({ version: 2, name: "wf", steps: [baseStep("a")] })).toThrow();
  });

  it("rejects empty steps array", () => {
    expect(() => compileWorkflow({ version: 1, name: "wf", steps: [] })).toThrow();
  });

  it("rejects a step with no id/do (strict schema)", () => {
    expect(() =>
      compileWorkflow({ version: 1, name: "wf", steps: [{ id: "a" } as never] }),
    ).toThrow();
  });

  it("applies onError default of 'fail'", () => {
    const parsed = WorkflowStepSchema.parse(baseStep("a"));
    expect((parsed as { onError: string }).onError).toBe("fail");
  });

  it("GateSchema and OnErrorSchema enumerate the documented values", () => {
    expect(GateSchema.options).toEqual(["hitl", "validate"]);
    expect(OnErrorSchema.options).toEqual(["compensate", "retry", "fail"]);
  });
});

describe("compileWorkflow — dependency resolution", () => {
  it("topologically orders a linear chain", () => {
    const cw = compileWorkflow({
      version: 1,
      name: "wf",
      steps: [baseStep("a"), baseStep("b", ["a"]), baseStep("c", ["b"])],
    });
    expect(cw.order.indexOf("a")).toBeLessThan(cw.order.indexOf("b"));
    expect(cw.order.indexOf("b")).toBeLessThan(cw.order.indexOf("c"));
  });

  it("builds the downstream edges adjacency map", () => {
    const cw = compileWorkflow({
      version: 1,
      name: "wf",
      steps: [baseStep("a"), baseStep("b", ["a"])],
    });
    expect(cw.edges.get("a")).toEqual(["b"]);
    expect(cw.edges.get("b")).toEqual([]);
  });

  it("throws on unknown dependency", () => {
    expect(() =>
      compileWorkflow({ version: 1, name: "wf", steps: [baseStep("a", ["ghost"])] }),
    ).toThrow(/unknown step "ghost"/);
  });

  it("throws on a cycle", () => {
    expect(() =>
      compileWorkflow({
        version: 1,
        name: "wf",
        steps: [baseStep("a", ["b"]), baseStep("b", ["a"])],
      }),
    ).toThrow(/cycle/);
  });

  it("handles diamond dependencies", () => {
    const cw = compileWorkflow({
      version: 1,
      name: "wf",
      steps: [
        baseStep("a"),
        baseStep("b", ["a"]),
        baseStep("c", ["a"]),
        baseStep("d", ["b", "c"]),
      ],
    });
    expect(cw.order[0]).toBe("a");
    expect(cw.order.indexOf("d")).toBeGreaterThan(cw.order.indexOf("b"));
    expect(cw.order.indexOf("d")).toBeGreaterThan(cw.order.indexOf("c"));
  });
});

describe("WorkflowDSLSchema", () => {
  it("hydrates the exported schema", () => {
    const parsed = WorkflowDSLSchema.parse({
      version: 1,
      name: "x",
      steps: [baseStep("a")],
    });
    expect(parsed.steps).toHaveLength(1);
  });
});
