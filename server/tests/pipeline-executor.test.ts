/**
 * Pipeline-executor unit tests — pure DAG validation, no database required.
 */
import { describe, it, expect } from "vitest";
import { validateDAG } from "../src/services/pipeline-executor.js";
import type { PipelineDAG, PipelineNode, PipelineEdge, NodeType } from "../src/services/pipeline-executor.js";

function trigger(id: string): PipelineNode {
  return { id, type: "trigger.manual" as NodeType, position: { x: 0, y: 0 }, config: {} };
}

function node(id: string, type: NodeType = "tool.invoke"): PipelineNode {
  return { id, type, position: { x: 0, y: 0 }, config: {} };
}

function edge(from: string, to: string): PipelineEdge {
  return { from, to };
}

function dag(nodes: PipelineNode[], edges: PipelineEdge[]): PipelineDAG {
  return { nodes, edges };
}

describe("pipeline-executor — validateDAG", () => {
  it("accepts a valid single-trigger DAG", () => {
    const d = dag([trigger("a")], []);
    expect(validateDAG(d)).toEqual({ ok: true });
  });

  it("accepts a valid linear DAG", () => {
    const d = dag(
      [trigger("a"), node("b", "agent.run"), node("c", "output.sink")],
      [edge("a", "b"), edge("b", "c")],
    );
    expect(validateDAG(d)).toEqual({ ok: true });
  });

  it("accepts a valid parallel DAG", () => {
    const d = dag(
      [trigger("start"), node("a", "agent.run"), node("b", "agent.run"), node("end", "output.sink")],
      [edge("start", "a"), edge("start", "b"), edge("a", "end"), edge("b", "end")],
    );
    expect(validateDAG(d)).toEqual({ ok: true });
  });

  it("accepts a diamond pattern DAG", () => {
    const d = dag(
      [trigger("start"), node("b", "tool.invoke"), node("c", "tool.invoke"), node("end", "output.sink")],
      [edge("start", "b"), edge("start", "c"), edge("b", "end"), edge("c", "end")],
    );
    expect(validateDAG(d)).toEqual({ ok: true });
  });

  it("rejects an empty DAG", () => {
    const d = dag([], []);
    expect(validateDAG(d)).toEqual({ ok: false, reason: "empty_dag" });
  });

  it("rejects a DAG with a cycle", () => {
    const d = dag(
      [trigger("a"), node("b"), node("c")],
      [edge("a", "b"), edge("b", "c"), edge("c", "b")],
    );
    expect(validateDAG(d)).toEqual({ ok: false, reason: "cycle_detected" });
  });

  it("rejects a DAG with a self-loop", () => {
    const d = dag([trigger("a")], [edge("a", "a")]);
    expect(validateDAG(d)).toEqual({ ok: false, reason: "cycle_detected" });
  });

  it("rejects a DAG with multiple triggers", () => {
    const d = dag(
      [trigger("t1"), trigger("t2"), node("a")],
      [edge("t1", "a"), edge("t2", "a")],
    );
    expect(validateDAG(d)).toEqual({ ok: false, reason: "multiple_triggers" });
  });

  it("rejects dangling edges (from node not in graph)", () => {
    const d = dag([trigger("a")], [edge("ghost", "a")]);
    expect(validateDAG(d)).toEqual({ ok: false, reason: "dangling_edge:ghost->a" });
  });

  it("rejects dangling edges (to node not in graph)", () => {
    const d = dag([trigger("a")], [edge("a", "ghost")]);
    expect(validateDAG(d)).toEqual({ ok: false, reason: "dangling_edge:a->ghost" });
  });

  it("accepts disconnected subgraph (orphan nodes are valid DAG)", () => {
    const d = dag([trigger("a"), node("b")], []);
    expect(validateDAG(d)).toEqual({ ok: true });
  });
});
