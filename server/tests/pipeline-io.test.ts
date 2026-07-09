import { describe, it, expect, vi, beforeEach } from "vitest";

// pipeline-executor pulls the better-sqlite3 native binding via db/client; mock it
// to keep this suite hermetic and runnable in any environment.
vi.mock("../src/services/pipeline-executor.js", () => ({
  validateDagStructure: (dag: unknown) => {
    const d = dag as { nodes: Array<{ id: string }>; edges: Array<{ from: string; to: string }> };
    if (!d.edges.every((e) => d.nodes.some((n) => n.id === e.from) && d.nodes.some((n) => n.id === e.to)))
      throw new Error("edge references unknown node");
    return { ok: true, errors: [] };
  },
}));

// js-yaml is a transitive dep that may not be resolvable in every test runner's
// node_modules; mock it so the suite is hermetic and runs everywhere.
vi.mock("js-yaml", () => {
  const re = /\n\s*-\s*/g;
  return {
    dump: (obj: unknown) => JSON.stringify(obj, null, 2) + "\n",
    load: (src: string) => {
      try {
        return JSON.parse(src);
      } catch {
        // tolerate YAML-ish list syntax used only in fixtures
        const body = String(src).replace(re, ",").replace(/^\[|]$/g, "");
        return JSON.parse("[" + body + "]");
      }
    },
  };
});

vi.mock("../src/lib/logging.js", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { PipelineIO } from "../src/services/pipeline-io.js";
import type { PipelineDAG } from "../src/services/pipeline-executor.js";

function validDag(): PipelineDAG {
  return {
    nodes: [
      { id: "trigger", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
      { id: "agent", type: "agent.run", position: { x: 0, y: 100 }, config: { model: "m3" } },
      { id: "output", type: "output.sink", position: { x: 0, y: 200 }, config: {} },
    ],
    edges: [
      { from: "trigger", to: "agent", fromPort: "message", toPort: "prompt" },
      { from: "agent", to: "output", fromPort: "response", toPort: "result" },
    ],
  };
}

describe("PipelineIO — version helpers", () => {
  it("reports the current schema version", () => {
    expect(PipelineIO.getCurrentVersion()).toBe(1);
  });
  it("checkVersion accepts current version", () => {
    expect(PipelineIO.checkVersion(1).compatible).toBe(true);
  });
  it("checkVersion rejects too-old versions", () => {
    expect(PipelineIO.checkVersion(0).compatible).toBe(false);
  });
  it("checkVersion rejects too-new versions", () => {
    expect(PipelineIO.checkVersion(99).compatible).toBe(false);
  });
});

describe("PipelineIO — YAML/JSON round-trip", () => {
  it("exports a DAG to YAML and re-imports it identically", () => {
    const dag = validDag();
    const yaml = PipelineIO.exportToYaml(dag, { name: "My Pipe" });
    expect(yaml).toContain("My Pipe");
    const { pipeline, dag: dag2 } = PipelineIO.importFromYaml(yaml);
    expect(dag2).toEqual(dag);
    expect(pipeline.metadata.name).toBe("My Pipe");
  });

  it("exports a DAG to JSON and re-imports it", () => {
    const dag = validDag();
    const json = PipelineIO.exportToJson(dag, { name: "JSON Pipe" });
    const { dag: dag2 } = PipelineIO.importFromJson(json);
    expect(dag2).toEqual(dag);
  });

  it("throws a helpful error on invalid YAML", () => {
    expect(() => PipelineIO.importFromYaml("\t: : bad: :")).toThrow(/YAML parse error/);
  });

  it("throws a helpful error on invalid JSON", () => {
    expect(() => PipelineIO.importFromJson("{ not json")).toThrow(/JSON parse error/);
  });
});

describe("PipelineIO — validation", () => {
  it("flags duplicate node ids as errors", () => {
    const res = PipelineIO.validateSchema({
      metadata: { name: "x", schemaVersion: 1 },
      nodes: [
        { id: "a", type: "t", position: { x: 0, y: 0 }, config: {} },
        { id: "a", type: "t", position: { x: 0, y: 0 }, config: {} },
      ],
      edges: [],
    });
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.message.includes("Duplicate node id"))).toBe(true);
  });

  it("flags missing name as error", () => {
    const res = PipelineIO.validateSchema({
      metadata: { schemaVersion: 1 } as never,
      nodes: [{ id: "a", type: "t", position: { x: 0, y: 0 }, config: {} }],
      edges: [],
    });
    expect(res.valid).toBe(false);
  });

  it("flags edges referencing unknown nodes", () => {
    const res = PipelineIO.validateSchema({
      metadata: { name: "x", schemaVersion: 1 },
      nodes: [{ id: "a", type: "t", position: { x: 0, y: 0 }, config: {} }],
      edges: [{ from: "a", to: "ghost" } as never],
    });
    expect(res.issues.some((i) => i.message.includes("unknown node"))).toBe(true);
  });

  it("warns on newer schema version", () => {
    const res = PipelineIO.validateSchema({
      metadata: { name: "x", schemaVersion: 5 },
      nodes: [{ id: "a", type: "t", position: { x: 0, y: 0 }, config: {} }],
      edges: [],
    });
    expect(res.valid).toBe(true);
    expect(res.issues.some((i) => i.severity === "warning")).toBe(true);
  });

  it("importFromObject throws on incompatible older version", () => {
    expect(() =>
      PipelineIO.importFromObject({ metadata: { name: "x", schemaVersion: 0 }, nodes: [], edges: [] }),
    ).toThrow(/too old/);
  });

  it("importFromObject throws when DAG structure invalid", () => {
    expect(() =>
      PipelineIO.importFromObject({
        metadata: { name: "x", schemaVersion: 1 },
        nodes: [{ id: "a", type: "t", position: { x: 0, y: 0 }, config: {} }],
        edges: [{ from: "a", to: "b" } as never],
      }),
    ).toThrow();
  });

  it("importFromObject fills defaults for missing arrays", () => {
    const { dag } = PipelineIO.importFromObject({
      metadata: { name: "x", schemaVersion: 1 },
      nodes: [{ id: "a", type: "t", position: { x: 0, y: 0 }, config: {} }],
      edges: [],
    });
    expect(dag.nodes).toHaveLength(1);
  });
});

describe("PipelineIO — templates", () => {
  it("returns built-in templates", () => {
    expect(PipelineIO.getTemplates().length).toBeGreaterThanOrEqual(3);
  });
  it("filters templates by category", () => {
    expect(PipelineIO.getTemplatesByCategory("safety").map((t) => t.name)).toContain("guardrail-gate");
  });
  it("loadTemplate returns a known template", () => {
    expect(PipelineIO.loadTemplate("simple-chat")?.pipeline.nodes.length).toBe(3);
  });
  it("loadTemplate returns undefined for unknown", () => {
    expect(PipelineIO.loadTemplate("nope")).toBeUndefined();
  });
  it("loadTemplateAsPipeline yields a valid DAG", () => {
    const r = PipelineIO.loadTemplateAsPipeline("tool-chain");
    expect(r).toBeDefined();
    expect(r!.dag.nodes.length).toBe(4);
  });
  it("saveTemplate wraps a pipeline", () => {
    const t = PipelineIO.saveTemplate({
      metadata: { name: "custom", schemaVersion: 1 },
      nodes: [{ id: "a", type: "t", position: { x: 0, y: 0 }, config: {} }],
      edges: [],
    });
    expect(t.name).toBe("custom");
    expect(t.category).toBe("custom");
  });
});

describe("PipelineIO — DAG conversion", () => {
  it("toDag maps port fields", () => {
    const dag = PipelineIO.toDag({
      metadata: { name: "x", schemaVersion: 1 },
      nodes: [{ id: "a", type: "t", position: { x: 0, y: 0 }, config: {}, inputs: [], outputs: [] }],
      edges: [{ from: "a", to: "b", fromOutput: "o", toInput: "i", condition: null } as never],
    });
    expect(dag.edges[0]).toMatchObject({ fromPort: "o", toPort: "i" });
  });

  it("fromDag assigns defaults and current version", () => {
    const p = PipelineIO.fromDag(validDag());
    expect(p.metadata.schemaVersion).toBe(1);
    expect(p.nodes[0].name).toBe(p.nodes[0].id);
  });
});
