import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Mock the heavy side-effecting collaborators so we can test the registry logic.
const getAgent = vi.fn();
const authorizeToolCall = vi.fn();
const appendAudit = vi.fn(async () => {});
const withTimeout = vi.fn();

vi.mock("../src/services/kernel.js", () => ({
  getAgent: (...a: unknown[]) => getAgent(...a),
  authorizeToolCall: (...a: unknown[]) => authorizeToolCall(...a),
}));
vi.mock("../src/lib/audit.js", () => ({
  appendAudit: (...a: unknown[]) => appendAudit(...a),
}));
vi.mock("../src/services/recall.js", () => ({ recall: vi.fn() }));
vi.mock("../src/services/memory.service.js", () => ({ createMemory: vi.fn() }));
vi.mock("../src/services/skill.service.js", () => ({ createSkill: vi.fn() }));
vi.mock("../src/db/client.js", () => ({
  db: {},
  memories: {},
  skills: {},
  eq: (...a: unknown[]) => a,
}));

import { ActionRegistry, executeActionWithTimeout } from "../src/services/action-registry.js";
import type { Action } from "../src/services/action-registry.js";

function makeAction(name: string, similes: string[] = []): Action {
  return {
    name,
    description: `desc for ${name}`,
    schema: z.object({ x: z.number() }),
    handler: vi.fn(async (input) => ({ doubled: (input.x as number) * 2 })),
    similes,
    examples: [],
    metadata: { version: "1.0.0" },
  };
}

describe("ActionRegistry — container", () => {
  let reg: ActionRegistry;
  beforeEach(() => {
    reg = new ActionRegistry();
  });

  it("registers and gets an action", () => {
    const a = makeAction("foo");
    reg.register(a);
    expect(reg.get("foo")).toBe(a);
  });

  it("throws on duplicate register", () => {
    reg.register(makeAction("foo"));
    expect(() => reg.register(makeAction("foo"))).toThrow(/already registered/);
  });

  it("unregisters", () => {
    reg.register(makeAction("foo"));
    expect(reg.unregister("foo")).toBe(true);
    expect(reg.get("foo")).toBeUndefined();
    expect(reg.unregister("foo")).toBe(false);
  });

  it("lists registered actions", () => {
    reg.register(makeAction("a"));
    reg.register(makeAction("b"));
    expect(reg.list().map((a) => a.name).sort()).toEqual(["a", "b"]);
  });

  it("find matches by name, description, and simile", () => {
    reg.register(makeAction("email_send", ["mail", "dispatch"]));
    expect(reg.find("email").map((a) => a.name)).toEqual(["email_send"]);
    expect(reg.find("dispatch").map((a) => a.name)).toEqual(["email_send"]);
  });

  it("fuzzyFind returns exact match first", () => {
    reg.register(makeAction("email_send", ["mail"]));
    reg.register(makeAction("email_read", ["mail"]));
    expect(reg.fuzzyFind("email_send")?.name).toBe("email_send");
  });

  it("fuzzyFind scores prefix matches higher", () => {
    reg.register(makeAction("send_email", ["mail"]));
    reg.register(makeAction("read_inbox", ["mail"]));
    expect(reg.fuzzyFind("send")?.name).toBe("send_email");
  });

  it("fuzzyFind returns undefined when nothing scores", () => {
    reg.register(makeAction("ping"));
    expect(reg.fuzzyFind("totally-unrelated")).toBeUndefined();
  });

  it("toToolSpecs maps metadata to ToolSpec with sane defaults", () => {
    reg.register(makeAction("foo"));
    const specs = reg.toToolSpecs();
    expect(specs[0]).toMatchObject({
      name: "foo",
      provider: "builtin",
      riskLevel: "read",
      minRing: 2,
      retryable: true,
      approvalRequired: false,
    });
  });

  it("toToolSpecs marks destructive actions as approval-required", () => {
    const a = makeAction("rm");
    a.metadata.riskLevel = "destructive";
    reg.register(a);
    expect(reg.toToolSpecs()[0].approvalRequired).toBe(true);
  });
});

describe("ActionRegistry.execute — authorization paths", () => {
  beforeEach(() => {
    getAgent.mockReset();
    authorizeToolCall.mockReset();
    appendAudit.mockClear();
  });

  it("returns not-found when action missing", async () => {
    const reg = new ActionRegistry();
    const res = await reg.execute("nope", {}, { agentId: "a", actor: "x" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("not found");
  });

  it("fails validation on bad input and does NOT call authorize", async () => {
    const reg = new ActionRegistry();
    reg.register(makeAction("foo"));
    const res = await reg.execute("foo", { x: "not-a-number" }, { agentId: "a", actor: "x" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Validation failed");
    expect(authorizeToolCall).not.toHaveBeenCalled();
  });

  it("denies when authorizeToolCall returns false", async () => {
    authorizeToolCall.mockResolvedValue(false);
    getAgent.mockResolvedValue(null);
    const reg = new ActionRegistry();
    reg.register(makeAction("foo"));
    const res = await reg.execute("foo", { x: 2 }, { agentId: "a", actor: "x" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("ACL denied");
  });

  it("executes successfully and audits when authorized", async () => {
    authorizeToolCall.mockResolvedValue(true);
    getAgent.mockResolvedValue(null);
    const reg = new ActionRegistry();
    const a = makeAction("foo");
    reg.register(a);
    const res = await reg.execute("foo", { x: 21 }, { agentId: "a", actor: "x", traceId: "t1" });
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ doubled: 42 });
    expect(a.handler).toHaveBeenCalledOnce();
    expect(appendAudit).toHaveBeenCalled();
  });

  it("blocks a quarantined agent", async () => {
    getAgent.mockResolvedValue({ ring: 2, status: "quarantined" });
    const reg = new ActionRegistry();
    reg.register(makeAction("foo"));
    const res = await reg.execute("foo", { x: 1 }, { agentId: "a", actor: "x" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("quarantined");
    expect(authorizeToolCall).not.toHaveBeenCalled();
  });
});

describe("executeActionWithTimeout", () => {
  beforeEach(() => {
    getAgent.mockReset();
    authorizeToolCall.mockReset();
  });

  it("returns a durationMs and ok result on success", async () => {
    authorizeToolCall.mockResolvedValue(true);
    getAgent.mockResolvedValue(null);
    const a = makeAction("foo");
    const res = await executeActionWithTimeout(a, { x: 10 }, { agentId: "a", actor: "x" });
    expect(res.ok).toBe(true);
    expect(typeof res.durationMs).toBe("number");
  });

  it("returns validation error without calling handler", async () => {
    const a = makeAction("foo");
    const res = await executeActionWithTimeout(a, { x: "bad" }, { agentId: "a", actor: "x" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Validation failed");
    expect(a.handler).not.toHaveBeenCalled();
  });
});
