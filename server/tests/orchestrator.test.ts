import { describe, it, expect, vi, beforeEach } from "vitest";

const enqueueTask = vi.fn(async () => "task-1");
const appendAudit = vi.fn(async () => {});
const dbInsert = vi.fn(() => ({ values: vi.fn(() => ({ execute: vi.fn(async () => {}) })) }));

vi.mock("../src/services/kernel.js", () => ({
  enqueueTask: (...a: unknown[]) => enqueueTask(...a),
}));
vi.mock("../src/lib/audit.js", () => ({
  appendAudit: (...a: unknown[]) => appendAudit(...a),
}));
vi.mock("../src/lib/logging.js", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../src/db/client.js", () => ({
  db: { insert: () => dbInsert(), schema: { trajectoryLogs: { name: "trajectoryLogs" } } },
}));
vi.mock("../src/services/planner.js", () => ({
  planRun: vi.fn(async () => ({
    id: "plan-1",
    goal: "g",
    createdAt: 0,
    source: "template",
    steps: [{ id: "s0", label: "s0", capability: "general", instruction: "do", dependsOn: [] }],
  })),
  validatePlanAcyclic: vi.fn(() => ({ ok: true, errors: [] })),
}));
vi.mock("../src/services/dag-executor.js", () => ({
  executePlan: vi.fn(async () => ({ runId: "run-1", ok: true, errors: [] })),
}));
vi.mock("../src/services/consensus.js", () => ({
  tallyConsensus: vi.fn(),
}));

import { orchestrate, orchestrateGated } from "../src/services/orchestrator.js";
import { tallyConsensus } from "../src/services/consensus.js";
import type { Vote } from "../src/services/consensus.js";

describe("orchestrate", () => {
  beforeEach(() => enqueueTask.mockClear());
  it("derives an idempotency key from the goal when omitted", async () => {
    const res = await orchestrate({ goal: "make coffee" });
    expect(res.idempotencyKey).toBe(`orch:${Buffer.from("make coffee").toString("base64url")}`);
    expect(enqueueTask).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: res.idempotencyKey, input: { goal: "make coffee" } }),
      "orchestrator",
    );
  });

  it("honors an explicit idempotency key", async () => {
    const res = await orchestrate({ goal: "g", idempotencyKey: "key-xyz" });
    expect(res.idempotencyKey).toBe("key-xyz");
    expect(res.planId).toBe("plan-1");
    expect(res.runId).toBe("run-1");
    expect(res.ok).toBe(true);
  });

  it("throws when the plan has a cycle", async () => {
    const { validatePlanAcyclic } = await import("../src/services/planner.js");
    (validatePlanAcyclic as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      ok: false,
      errors: ["cycle"],
      cycle: ["s0", "s1"],
    });
    await expect(orchestrate({ goal: "g", idempotencyKey: "k" })).rejects.toThrow(/cycle/);
  });
});

describe("orchestrateGated", () => {
  beforeEach(() => enqueueTask.mockClear());
  it("blocks orchestration when consensus does not approve", async () => {
    (tallyConsensus as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      winner: "reject",
      confidence: 0.6,
      tie: false,
    });
    const votes: Vote[] = [
      { agentId: "a1", vote: "approve" },
      { agentId: "a2", vote: "reject" },
    ];
    await expect(orchestrateGated({ goal: "g" }, "majority", votes)).rejects.toThrow(
      /blocked by consensus/,
    );
    expect(enqueueTask).not.toHaveBeenCalled();
  });

  it("proceeds to orchestrate when consensus approves", async () => {
    (tallyConsensus as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      winner: "approve",
      confidence: 0.9,
      tie: false,
    });
    const votes: Vote[] = [
      { agentId: "a1", vote: "approve" },
      { agentId: "a2", vote: "approve" },
    ];
    const res = await orchestrateGated({ goal: "g", idempotencyKey: "k2" }, "majority", votes);
    expect(res.ok).toBe(true);
    expect(enqueueTask).toHaveBeenCalled();
  });
});
