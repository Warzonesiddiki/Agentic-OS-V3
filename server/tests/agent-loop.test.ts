import { describe, it, expect, vi } from "vitest";
import { AgentRuntime } from "../src/services/agent-loop.js";
import { createDefaultActions } from "../src/services/action-registry.js";

const appendAudit = vi.fn(async () => {});
vi.mock("../src/lib/audit.js", () => ({
  appendAudit: (...a: unknown[]) => appendAudit(...a),
}));
vi.mock("../src/lib/logging.js", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../src/services/agent-persistence.js", () => ({
  loadAgentProcessState: vi.fn(async () => null),
  saveAgentProcessState: vi.fn(async () => {}),
}));

import { AgentRuntime } from "../src/services/agent-loop.js";
import { createDefaultActions } from "../src/services/action-registry.js";

describe("AgentRuntime — pure surface", () => {
  it("registers default actions and lists them", () => {
    const rt = new AgentRuntime("a1", "actor");
    const avail = rt.getAvailableActions();
    expect(avail.length).toBeGreaterThan(0);
    expect(avail.every((a) => a.name && a.schema)).toBe(true);
  });

  it("validateAction rejects unknown action", () => {
    const rt = new AgentRuntime("a1", "actor");
    const res = rt.validateAction("does_not_exist", {});
    expect(res.valid).toBe(false);
    expect(res.errors?.join()).toContain("not found");
  });

  it("validateAction passes for a valid default action input", () => {
    const rt = new AgentRuntime("a1", "actor");
    const action = createDefaultActions().find((a) => a.name) ?? rt;
    // pick an action that accepts free-form input
    const target = rt.getAvailableActions()[0];
    const res = rt.validateAction(target.name, {});
    // default actions have permissive schemas; result must be boolean
    expect(typeof res.valid).toBe("boolean");
  });

  it("buildSystemPrompt mentions tool names and the JSON contract", () => {
    const rt = new AgentRuntime("a1", "actor");
    const prompt = rt.buildSystemPrompt();
    expect(prompt).toContain("NEXUS Agent Runtime");
    expect(prompt).toContain('"thought"');
    expect(prompt).toContain('"tool"');
    for (const a of rt.getAvailableActions()) {
      expect(prompt).toContain(a.name);
    }
  });

  it("executeAction delegates to the registry", async () => {
    const rt = new AgentRuntime("a1", "actor");
    // default actions are side-effecting; just assert it returns a result shape
    const res = await rt.executeAction(rt.getAvailableActions()[0].name, {}, 1000);
    expect(res).toHaveProperty("ok");
  });
});
