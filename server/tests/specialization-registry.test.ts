import { describe, it, expect, vi } from "vitest";

vi.mock("../src/lib/logging.js", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SpecializationRegistry } from "../src/services/specialization-registry.js";
import type { RegisteredAgent } from "../src/services/specialization-registry.js";
import { AgentCapabilitySchema } from "@agentic-os/a2a-server";

function cap(name: string, domain: string = "Dev") {
  return AgentCapabilitySchema.parse({
    name,
    domain,
    category: "read",
    sideEffects: ["memory.read"],
    scopes: ["mem:r"],
    failureMode: "fail-closed",
  });
}

function agent(partial: Partial<RegisteredAgent> & { agentId: string }): RegisteredAgent {
  return {
    capability: cap("translate"),
    version: "1.0.0",
    reputation: 0.8,
    costTier: 2,
    load: 0.2,
    available: true,
    ...partial,
  };
}

describe("SpecializationRegistry", () => {
  it("registers and lists agents after validating schema", () => {
    const reg = new SpecializationRegistry();
    reg.register(agent({ agentId: "a1" }));
    expect(reg.list()).toHaveLength(1);
  });

  it("rejects an invalid capability version (register calls CapabilityVersionSchema)", () => {
    const reg = new SpecializationRegistry();
    expect(() =>
      reg.register(agent({ agentId: "a2", version: "v1" as never })),
    ).toThrow();
  });

  it("unregisters", () => {
    const reg = new SpecializationRegistry();
    reg.register(agent({ agentId: "a1" }));
    reg.unregister("a1");
    expect(reg.list()).toHaveLength(0);
  });

  it("filters by capability name", () => {
    const reg = new SpecializationRegistry();
    reg.register(agent({ agentId: "a1", capability: cap("translate") }));
    reg.register(agent({ agentId: "a2", capability: cap("summarize") }));
    const res = reg.match({ capability: "translate" });
    expect(res.map((a) => a.agentId)).toEqual(["a1"]);
  });

  it("filters by domain", () => {
    const reg = new SpecializationRegistry();
    reg.register(agent({ agentId: "a1", capability: cap("translate", "Dev") }));
    reg.register(agent({ agentId: "a2", capability: cap("translate", "Research") }));
    const res = reg.match({ capability: "translate", domain: "Research" });
    expect(res.map((a) => a.agentId)).toEqual(["a2"]);
  });

  it("skips unavailable agents", () => {
    const reg = new SpecializationRegistry();
    reg.register(agent({ agentId: "a1", available: false }));
    expect(reg.match({ capability: "translate" })).toHaveLength(0);
  });

  it("enforces minReputation", () => {
    const reg = new SpecializationRegistry();
    reg.register(agent({ agentId: "a1", reputation: 0.3 }));
    reg.register(agent({ agentId: "a2", reputation: 0.9 }));
    const res = reg.match({ capability: "translate", minReputation: 0.5 });
    expect(res.map((a) => a.agentId)).toEqual(["a2"]);
  });

  it("enforces maxCostTier", () => {
    const reg = new SpecializationRegistry();
    reg.register(agent({ agentId: "a1", costTier: 1 }));
    reg.register(agent({ agentId: "a2", costTier: 5 }));
    const res = reg.match({ capability: "translate", maxCostTier: 3 });
    expect(res.map((a) => a.agentId)).toEqual(["a1"]);
  });

  it("ranks higher reputation / lower cost higher", () => {
    const reg = new SpecializationRegistry();
    reg.register(agent({ agentId: "cheap", reputation: 0.5, costTier: 1, load: 0.1 }));
    reg.register(agent({ agentId: "best", reputation: 0.99, costTier: 2, load: 0.1 }));
    const res = reg.match({ capability: "translate" });
    expect(res[0].agentId).toBe("best");
  });

  it("costOptimized biases toward cheaper agents", () => {
    const reg = new SpecializationRegistry();
    reg.register(agent({ agentId: "pricey", reputation: 0.99, costTier: 5, load: 0.1 }));
    reg.register(agent({ agentId: "budget", reputation: 0.99, costTier: 1, load: 0.1 }));
    const res = reg.match({ capability: "translate", costOptimized: true });
    expect(res[0].agentId).toBe("budget");
  });

  it("pick returns the top match", () => {
    const reg = new SpecializationRegistry();
    reg.register(agent({ agentId: "a1", reputation: 0.9 }));
    expect(reg.pick({ capability: "translate" })?.agentId).toBe("a1");
  });

  it("pick returns undefined when none match", () => {
    const reg = new SpecializationRegistry();
    expect(reg.pick({ capability: "nope" })).toBeUndefined();
  });
});
