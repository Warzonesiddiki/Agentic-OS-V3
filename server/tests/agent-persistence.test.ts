import { describe, it, expect, vi, beforeEach } from "vitest";

const getAgent = vi.fn();
const dbUpdate = vi.fn(() => ({
  set: vi.fn(() => ({ where: vi.fn(async () => {}) })),
}));
const dbInsert = vi.fn(() => ({ values: vi.fn(async () => {}) }));
const agentsEq = vi.fn(() => true);

vi.mock("../src/services/kernel.js", () => ({
  getAgent: (...a: unknown[]) => getAgent(...a),
}));
vi.mock("../src/db/client.js", () => ({
  db: {
    update: (...a: unknown[]) => dbUpdate(...a),
    insert: (...a: unknown[]) => dbInsert(...a),
  },
  agents: { id: "id-col", metadata: "meta-col", updatedAt: "ua-col" },
  eq: (...a: unknown[]) => agentsEq(...a),
  stateSnapshots: { name: "stateSnapshots" },
}));

import { saveAgentProcessState, loadAgentProcessState } from "../src/services/agent-persistence.js";
import type { AgentExecutionState } from "../src/services/agent-persistence.js";

function makeState(): AgentExecutionState {
  return {
    agentId: "a1",
    goal: "g",
    context: {},
    currentIteration: 2,
    maxIterations: 10,
    steps: [],
    tokensUsed: 100,
    conversation: "hi",
    status: "running",
    updatedAt: new Date().toISOString(),
  };
}

describe("agent-persistence", () => {
  beforeEach(() => {
    getAgent.mockReset();
    dbUpdate.mockClear();
    dbInsert.mockClear();
  });

  it("saveAgentProcessState no-ops when agent missing", async () => {
    getAgent.mockResolvedValue(null);
    await saveAgentProcessState(makeState());
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("saveAgentProcessState writes agent metadata and a snapshot when agent exists", async () => {
    getAgent.mockResolvedValue({ metadata: {}, id: "a1" });
    await saveAgentProcessState(makeState());
    expect(dbUpdate).toHaveBeenCalled();
    expect(dbInsert).toHaveBeenCalled();
  });

  it("loadAgentProcessState returns null when agent missing", async () => {
    getAgent.mockResolvedValue(null);
    expect(await loadAgentProcessState("a1")).toBeNull();
  });

  it("loadAgentProcessState returns stored executionState when present", async () => {
    const state = makeState();
    getAgent.mockResolvedValue({ metadata: { executionState: state } });
    expect(await loadAgentProcessState("a1")).toEqual(state);
  });

  it("loadAgentProcessState returns null when no executionState stored", async () => {
    getAgent.mockResolvedValue({ metadata: {} });
    expect(await loadAgentProcessState("a1")).toBeNull();
  });
});
