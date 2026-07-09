import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerHook,
  emitSignal,
  listHooks,
  clearAllHooks,
  createChainedHook,
  composeHooks,
} from "../src/services/signal-hooks.js";

const agentStart = {
  agentId: "a1",
  goal: "g",
  actor: "x",
  timestamp: 1,
} as const;

const agentEnd = {
  agentId: "a1",
  ok: true,
  answer: "",
  iterations: 1,
  tokensUsed: 1,
  timestamp: 1,
} as const;

const toolEnd = {
  agentId: "a1",
  tool: "t",
  input: {},
  output: {},
  durationMs: 1,
  timestamp: 1,
} as const;

const handoff = {
  fromAgentId: "a",
  toAgentId: "b",
  payload: {},
  timestamp: 1,
} as const;

describe("signal-hooks", () => {
  beforeEach(() => clearAllHooks());

  it("registers and lists a hook with metadata", () => {
    const h = vi.fn();
    registerHook("on_agent_start", h, { priority: 5, name: "h1" });
    const list = listHooks();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ event: "on_agent_start", name: "h1", priority: 5 });
  });

  it("defaults priority and name when not supplied", () => {
    // A plain anonymous arrow function has name "" so the default "anonymous" applies.
    registerHook("on_agent_start", () => {});
    const list = listHooks();
    expect(list[0].priority).toBe(0);
    expect(list[0].name).toBe("anonymous");
  });

  it("emits context to a registered handler", async () => {
    const h = vi.fn();
    registerHook("on_agent_start", h);
    await emitSignal("on_agent_start", { ...agentStart });
    expect(h).toHaveBeenCalledTimes(1);
    expect(h.mock.calls[0]?.[0].agentId).toBe("a1");
  });

  it("orders handlers by descending priority", async () => {
    const order: string[] = [];
    registerHook(
      "on_agent_start",
      async () => {
        order.push("low");
      },
      { priority: 1, name: "low" },
    );
    registerHook(
      "on_agent_start",
      async () => {
        order.push("high");
      },
      { priority: 10, name: "high" },
    );
    await emitSignal("on_agent_start", { ...agentStart });
    expect(order).toEqual(["high", "low"]);
  });

  it("stops delivery after unregister", async () => {
    const h = vi.fn();
    const unsub = registerHook("on_tool_end", h);
    unsub();
    await emitSignal("on_tool_end", { ...toolEnd });
    expect(h).not.toHaveBeenCalled();
  });

  it("does not throw when no hooks are registered", async () => {
    await expect(emitSignal("on_agent_start", { ...agentStart })).resolves.toBeUndefined();
  });

  it("survives a handler timeout without rejecting", async () => {
    const slow = () => new Promise<void>((r) => setTimeout(r, 1000));
    registerHook("on_agent_end", slow, { timeoutMs: 20, name: "slow" });
    await expect(emitSignal("on_agent_end", { ...agentEnd })).resolves.toBeUndefined();
  });

  it("survives a handler throw without rejecting", async () => {
    const bad = () => {
      throw new Error("boom");
    };
    registerHook("on_handoff", bad, { name: "bad" });
    await expect(emitSignal("on_handoff", { ...handoff })).resolves.toBeUndefined();
  });

  it("creates a chained hook that replays events", async () => {
    const a = vi.fn();
    const b = vi.fn();
    registerHook("on_agent_start", a);
    registerHook("on_tool_start", b);

    const chain = createChainedHook("on_agent_start", "on_tool_start");
    expect(chain.event).toBe("on_handoff");
    await chain.handler({ ...handoff } as any);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    clearAllHooks();
  });

  it("composes hooks sequentially and adopts max priority", async () => {
    const order: string[] = [];
    const h1 = {
      event: "on_agent_start" as const,
      handler: async () => {
        order.push("h1");
      },
      priority: 1,
      timeoutMs: 100,
      name: "h1",
    };
    const h2 = {
      event: "on_agent_start" as const,
      handler: async () => {
        order.push("h2");
      },
      priority: 2,
      timeoutMs: 100,
      name: "h2",
    };
    const composed = composeHooks(h1, h2);
    expect(composed.priority).toBe(2);
    expect(composed.timeoutMs).toBe(200);
    await composed.handler({ ...agentStart });
    expect(order).toEqual(["h1", "h2"]);
    clearAllHooks();
  });

  it("clearAllHooks empties the registry", () => {
    registerHook("on_agent_start", vi.fn());
    clearAllHooks();
    expect(listHooks()).toHaveLength(0);
  });
});
