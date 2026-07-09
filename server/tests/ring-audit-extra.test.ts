import { describe, it, expect, afterEach } from "vitest";
import {
  recordRingState,
  detectOscillation,
  resetRingStateHistory,
  RingOscillationDetector,
  recordRingChange,
  getRingChanges,
  resetRingAudit,
} from "../src/services/ring-audit.js";

describe("ring-audit (state oscillation + detector)", () => {
  afterEach(() => {
    resetRingStateHistory();
    resetRingAudit();
  });

  it("detects a flip-flop state pattern as oscillation", () => {
    recordRingState("ring0", "A");
    recordRingState("ring0", "B");
    recordRingState("ring0", "A");
    recordRingState("ring0", "B");
    expect(detectOscillation("ring0")).toBe(true);
  });

  it("does not flag a stable state as oscillation", () => {
    recordRingState("ring1", "A");
    recordRingState("ring1", "A");
    recordRingState("ring1", "A");
    recordRingState("ring1", "A");
    expect(detectOscillation("ring1")).toBe(false);
  });

  it("returns false when fewer than four states recorded", () => {
    recordRingState("ring2", "A");
    recordRingState("ring2", "B");
    expect(detectOscillation("ring2")).toBe(false);
  });

  it("clears history via resetRingStateHistory", () => {
    recordRingState("ring3", "A");
    resetRingStateHistory();
    recordRingState("ring3", "A");
    recordRingState("ring3", "B");
    recordRingState("ring3", "A");
    recordRingState("ring3", "B");
    expect(detectOscillation("ring3")).toBe(true);
  });

  it("RingOscillationDetector flags agents exceeding the threshold within the window", () => {
    const now = 1_000_000;
    const det = new RingOscillationDetector(3, 60_000);
    recordRingChange({
      agentId: "osc1",
      fromRing: 0,
      toRing: 1,
      reason: "t",
      ts: now - 1000,
    });
    recordRingChange({
      agentId: "osc1",
      fromRing: 1,
      toRing: 2,
      reason: "t",
      ts: now - 800,
    });
    recordRingChange({
      agentId: "osc1",
      fromRing: 2,
      toRing: 0,
      reason: "t",
      ts: now - 600,
    });
    recordRingChange({
      agentId: "osc1",
      fromRing: 0,
      toRing: 1,
      reason: "t",
      ts: now - 400,
    });
    const flags = det.detect(now);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.agentId).toBe("osc1");
    expect(flags[0]?.changes).toBe(4);
  });

  it("RingOscillationDetector ignores changes outside the window", () => {
    const det = new RingOscillationDetector(3, 60_000);
    const old = 1;
    const now = old + 200_000;
    recordRingChange({ agentId: "osc2", fromRing: 0, toRing: 1, reason: "t", ts: old });
    recordRingChange({ agentId: "osc2", fromRing: 1, toRing: 2, reason: "t", ts: old + 10 });
    recordRingChange({ agentId: "osc2", fromRing: 2, toRing: 0, reason: "t", ts: old + 20 });
    recordRingChange({ agentId: "osc2", fromRing: 0, toRing: 1, reason: "t", ts: old + 30 });
    expect(det.detect(now)).toHaveLength(0);
  });

  it("getRingChanges returns the per-agent audit trail", () => {
    recordRingChange({ agentId: "a1", fromRing: 0, toRing: 1, reason: "r", ts: 1 });
    recordRingChange({ agentId: "a1", fromRing: 1, toRing: 2, reason: "r", ts: 2 });
    const changes = getRingChanges("a1");
    expect(changes).toHaveLength(2);
    expect(changes[1]?.toRing).toBe(2);
  });
});
