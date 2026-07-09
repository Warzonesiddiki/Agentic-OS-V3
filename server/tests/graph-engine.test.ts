import { describe, it, expect, vi } from "vitest";

// graph-engine only imports ../lib/logging (used for warn on compensation failure)
vi.mock("../src/lib/logging.js", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  StateGraph,
  CompiledGraph,
  GraphError,
  NodeExecutionError,
  InMemoryCheckpointer,
} from "../src/services/graph-engine.js";

type S = Record<string, unknown>;

describe("StateGraph builder", () => {
  it("adds nodes and sets the first node as entry point automatically", () => {
    const g = new StateGraph<S>().addNode("a", async () => ({ x: 1 }));
    expect(g).toBeDefined();
    const compiled = g.compile();
    expect(compiled.entryPoint).toBe("a");
  });

  it("throws DUPLICATE_NODE when adding the same node twice", () => {
    const g = new StateGraph<S>().addNode("a", async () => ({}));
    expect(() => g.addNode("a", async () => ({}))).toThrowError(GraphError);
    expect(() => g.addNode("a", async () => ({}))).toThrow(/already exists/);
  });

  it("supports explicit setEntryPoint", () => {
    const g = new StateGraph<S>()
      .addNode("a", async () => ({}))
      .addNode("b", async () => ({}))
      .setEntryPoint("b");
    expect(g.compile().entryPoint).toBe("b");
  });

  it("throws UNKNOWN_NODE when setEntryPoint references a missing node", () => {
    const g = new StateGraph<S>();
    expect(() => g.setEntryPoint("missing")).toThrow(/not found/);
  });

  it("compile throws NO_ENTRY when no nodes were added", () => {
    expect(() => new StateGraph<S>().compile()).toThrow(/No entry point/);
  });

  it("compile throws NO_NODES when no nodes but entry point set", () => {
    const g = new StateGraph<S>();
    (g as unknown as { entryPoint: string | null }).entryPoint = "x";
    expect(() => g.compile()).toThrow(/No nodes defined/);
  });

  it("compile validates unconditional edges reference existing nodes", () => {
    const g = new StateGraph<S>().addNode("a", async () => ({}));
    g.addEdge("a", "b");
    expect(() => g.compile()).toThrow(/Edge references unknown node "b"/);
  });

  it("compile validates conditional edges reference existing nodes", () => {
    const g = new StateGraph<S>().addNode("a", async () => ({}));
    g.addConditionalEdges("a", () => "go", { go: "b" });
    expect(() => g.compile()).toThrow(/Conditional edge references unknown node "b"/);
  });

  it("addEdge and addConditionalEdges return this for chaining", () => {
    const g = new StateGraph<S>()
      .addNode("a", async () => ({}))
      .addNode("b", async () => ({}))
      .addEdge("a", "b");
    expect(g).toBeInstanceOf(StateGraph);
  });
});

describe("CompiledGraph.invoke — execution", () => {
  it("runs a single linear chain and threads state", async () => {
    const g = new StateGraph<S>()
      .addNode("a", async (s) => ({ ...s, a: 1 }))
      .addNode("b", async (s) => ({ ...s, b: (s.a as number) + 10 }))
      .addEdge("a", "b");
    const compiled = g.compile();
    const res = await compiled.invoke({ seed: 0 });
    expect(res.state.a).toBe(1);
    expect(res.state.b).toBe(11);
    expect(res.steps).toHaveLength(2);
    expect(res.steps.every((s) => !s.error)).toBe(true);
  });

  it("respects an explicit entry point via setEntryPoint", async () => {
    const g = new StateGraph<S>()
      .addNode("a", async () => ({ a: 1 }))
      .addNode("b", async (s) => ({ ...s, b: 2 }))
      .addEdge("a", "b")
      .setEntryPoint("b");
    const res = await g.compile().invoke({});
    expect(res.state.a).toBeUndefined();
    expect(res.state.b).toBe(2);
  });

  it("routes via conditional edges based on state", async () => {
    const g = new StateGraph<S>()
      .addNode("start", async () => ({ branch: "left" }))
      .addNode("left", async (s) => ({ ...s, taken: "L" }))
      .addNode("right", async (s) => ({ ...s, taken: "R" }))
      .addConditionalEdges("start", (s) => s.branch as string, {
        left: "left",
        right: "right",
      });
    const res = await g.compile().invoke({});
    expect(res.state.taken).toBe("L");
  });

  it("stops at a terminal node (no outgoing edge)", async () => {
    const g = new StateGraph<S>().addNode("only", async () => ({ done: true }));
    const res = await g.compile().invoke({});
    expect(res.steps).toHaveLength(1);
    expect(res.state.done).toBe(true);
  });

  it("halts at recursionLimit and records steps so far", async () => {
    const g = new StateGraph<S>()
      .addNode("loop", async (s) => ({ n: ((s.n as number) ?? 0) + 1 }))
      .addEdge("loop", "loop");
    const res = await g.compile().invoke({}, { recursionLimit: 5 });
    expect(res.steps).toHaveLength(5);
  });
});

describe("CompiledGraph — channel reducers & structural sharing", () => {
  it("applies channel reducers to merge updates", async () => {
    const g = new StateGraph<S>({
      channels: {
        items: {
          reducer: (cur: unknown, inc: unknown) =>
            [...((cur as unknown[]) ?? []), ...(inc as unknown[])],
        },
      },
    })
      .addNode("a", async () => ({ items: [1] }))
      .addNode("b", async () => ({ items: [2] }))
      .addEdge("a", "b");
    const res = await g.compile().invoke({ items: [] });
    expect(res.state.items).toEqual([1, 2]);
  });

  it("does not mutate the input base state (structural sharing)", async () => {
    const input = { base: 5 } as S;
    const g = new StateGraph<S>().addNode("a", async () => ({ added: 1 }));
    await g.compile().invoke(input);
    expect(input.added).toBeUndefined();
  });
});

describe("CompiledGraph — error handling & compensation", () => {
  it("records an error step when a node throws and does not advance", async () => {
    const g = new StateGraph<S>()
      .addNode("boom", async () => {
        throw new Error("kaboom");
      })
      .addNode("after", async () => ({ reached: true }))
      .addEdge("boom", "after");
    const res = await g.compile().invoke({});
    expect(res.steps[0].error).toBe("kaboom");
    expect(res.steps).toHaveLength(1);
    expect(res.state.reached).toBeUndefined();
  });

  it("runs compensation on failure and marks the step compensated", async () => {
    const compensatedFn = vi.fn(async () => {});
    const g = new StateGraph<S>()
      .addNode(
        "boom",
        async () => {
          throw new Error("kaboom");
        },
        compensatedFn,
      )
      .addNode("after", async () => ({ reached: true }))
      .addEdge("boom", "after");
    const res = await g.compile().invoke({});
    expect(compensatedFn).toHaveBeenCalledOnce();
    expect(res.steps[0].compensated).toBe(true);
  });

  it("ignores compensation errors and records the original node error", async () => {
    const { log } = await import("../src/lib/logging.js");
    const g = new StateGraph<S>()
      .addNode(
        "boom",
        async () => {
          throw new Error("kaboom");
        },
        async () => {
          throw new Error("comp-fail");
        },
      )
      .addNode("after", async () => ({}))
      .addEdge("boom", "after");
    const res = await g.compile().invoke({});
    expect(res.steps[0].error).toBe("kaboom");
    expect(res.steps[0].compensated).toBe(false);
    expect((log.warn as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it("throws NodeExecutionError when constructed directly", () => {
    const err = new NodeExecutionError("n1", new Error("root"));
    expect(err).toBeInstanceOf(GraphError);
    expect(err).toBeInstanceOf(Error);
    expect(err.nodeName).toBe("n1");
    expect(err.message).toContain("n1");
    expect(err.cause).toBeInstanceOf(Error);
  });
});

describe("InMemoryCheckpointer", () => {
  it("stores and retrieves checkpoints by thread+id", async () => {
    const cp = new InMemoryCheckpointer();
    const checkpoint = {
      threadId: "t1",
      checkpointId: "c1",
      parentCheckpointId: null,
      state: { x: 1 },
      node: "a",
      timestamp: 100,
      metadata: {},
    };
    await cp.put({ threadId: "t1", checkpointId: "c1" }, checkpoint);
    const got = await cp.get({ threadId: "t1", checkpointId: "c1" });
    expect(got?.state).toEqual({ x: 1 });
  });

  it("returns the latest checkpoint when only threadId is given", async () => {
    const cp = new InMemoryCheckpointer();
    await cp.put(
      { threadId: "t1", checkpointId: "c1" },
      {
        threadId: "t1",
        checkpointId: "c1",
        parentCheckpointId: null,
        state: { v: 1 },
        node: null,
        timestamp: 10,
        metadata: {},
      },
    );
    await cp.put(
      { threadId: "t1", checkpointId: "c2" },
      {
        threadId: "t1",
        checkpointId: "c2",
        parentCheckpointId: "c1",
        state: { v: 2 },
        node: null,
        timestamp: 20,
        metadata: {},
      },
    );
    const latest = await cp.get({ threadId: "t1" });
    expect(latest?.state).toEqual({ v: 2 });
  });

  it("lists and sorts checkpoints by timestamp", async () => {
    const cp = new InMemoryCheckpointer();
    await cp.put(
      { threadId: "t1", checkpointId: "c2" },
      {
        threadId: "t1",
        checkpointId: "c2",
        parentCheckpointId: null,
        state: {},
        node: null,
        timestamp: 5,
        metadata: {},
      },
    );
    await cp.put(
      { threadId: "t1", checkpointId: "c1" },
      {
        threadId: "t1",
        checkpointId: "c1",
        parentCheckpointId: null,
        state: {},
        node: null,
        timestamp: 1,
        metadata: {},
      },
    );
    const list = await cp.list("t1");
    expect(list.map((c) => c.checkpointId)).toEqual(["c1", "c2"]);
  });

  it("clear empties the store", async () => {
    const cp = new InMemoryCheckpointer();
    await cp.put(
      { threadId: "t1", checkpointId: "c1" },
      {
        threadId: "t1",
        checkpointId: "c1",
        parentCheckpointId: null,
        state: {},
        node: null,
        timestamp: 1,
        metadata: {},
      },
    );
    cp.clear();
    expect(await cp.list("t1")).toHaveLength(0);
  });
});

describe("CompiledGraph — time-travel resume via checkpointer", () => {
  it("saves a checkpoint per superstep and can resume from one", async () => {
    const checkpointer = new InMemoryCheckpointer();
    const g = new StateGraph<S>()
      .addNode("a", async (s) => ({ ...s, visited: [...((s.visited as string[]) ?? []), "a"] }))
      .addNode("b", async (s) => ({ ...s, visited: [...((s.visited as string[]) ?? []), "b"] }))
      .addEdge("a", "b");
    const compiled: CompiledGraph<S> = g.compile(checkpointer);

    const first = await compiled.invoke({ visited: [] });
    expect(first.state.visited).toEqual(["a", "b"]);

    const history = await compiled.getStateHistory({ threadId: first.threadId });
    expect(history.length).toBe(2);

    // Resume from the checkpoint after node "a" -> should continue at "b"
    const cpAfterA = history[0];
    const resumed = await compiled.invoke({ visited: [] }, { threadId: first.threadId, checkpointId: cpAfterA.checkpointId });
    expect(resumed.state.visited).toContain("b");
  });

  it("getState returns undefined without a checkpointer", async () => {
    const g = new StateGraph<S>().addNode("a", async () => ({ x: 1 }));
    const compiled = g.compile();
    expect(await compiled.getState({ threadId: "nope" })).toBeUndefined();
    expect(await compiled.getStateHistory({ threadId: "nope" })).toEqual([]);
  });
});
