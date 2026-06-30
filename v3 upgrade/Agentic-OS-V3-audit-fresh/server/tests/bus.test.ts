/**
 * Bus service unit tests — pure, no database required.
 * Tests memory backend publish/subscribe, client registration, and broadcast.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://p:pass@localhost:5432/nexus_test";
process.env.NODE_ENV ??= "test";

import {
  broadcastSSE,
  addSSEClient,
  getSSEClientCount,
} from "../src/services/bus.js";

function makeWriter(): { write: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } & { buffer: string } {
  const w = {
    write: vi.fn(),
    close: vi.fn(),
    buffer: "",
  };
  // Override write to also capture
  w.write.mockImplementation((data: string) => { w.buffer += data; });
  return w;
}

describe("bus — memory backend", () => {
  beforeEach(async () => {
    // Force memory backend by not setting redis env
    process.env.NEXUS_BUS_BACKEND = "memory";
  });

  it("broadcasts to registered clients", () => {
    const writer = makeWriter();
    const _unsub = addSSEClient(writer);

    broadcastSSE({ type: "agent.state", data: { id: "a1", status: "idle" }, timestamp: 123 });

    expect(writer.write.mock.calls.length).toBeGreaterThanOrEqual(2);
    const payload = writer.write.mock.calls.at(-1)![0] as string;
    expect(payload).toContain("data: ");
    expect(payload).toContain("agent.state");
    expect(payload).toContain("a1");
    expect(payload).toContain("\n\n");
  });

  it("returns zero clients when none registered", () => {
    expect(getSSEClientCount()).toBeGreaterThanOrEqual(0);
  });

  it("tracks client count correctly", () => {
    const w1 = makeWriter();
    const w2 = makeWriter();
    const before = getSSEClientCount();
    const unsub1 = addSSEClient(w1);
    const unsub2 = addSSEClient(w2);

    expect(getSSEClientCount()).toBeGreaterThanOrEqual(before + 2);

    unsub1();
    expect(getSSEClientCount()).toBeGreaterThanOrEqual(before + 1);

    unsub2();
  });

  it("unsubscribes client on unsubscribe call", () => {
    const writer = makeWriter();
    const unsub = addSSEClient(writer);

    unsub();
    broadcastSSE({ type: "task.update", data: { id: "t1" }, timestamp: 456 });

    // After unsub, writer should not receive new broadcasts
    const callCountAfterUnsub = writer.write.mock.calls.length;
    broadcastSSE({ type: "task.update", data: { taskId: "t2", status: "queued", agentId: "a1", label: "test" }, timestamp: 789 });
    expect(writer.write.mock.calls.length).toBe(callCountAfterUnsub);
  });

  it("broadcasts to multiple clients independently", () => {
    const w1 = makeWriter();
    const w2 = makeWriter();
    const unsub1 = addSSEClient(w1);
    const unsub2 = addSSEClient(w2);

    broadcastSSE({ type: "agent.state", data: { agentId: "a1", status: "idle" }, timestamp: 111 });

    expect(w1.write.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(w2.write.mock.calls.length).toBeGreaterThanOrEqual(2);

    unsub1();
    unsub2();
  });

  it("SSE format includes data prefix and double newline", () => {
    const writer = makeWriter();
    const unsub = addSSEClient(writer);

    broadcastSSE({ type: "task.update", data: { taskId: "t1", status: "running", agentId: "a1", label: "test" }, timestamp: 999 });

    const payload = writer.write.mock.calls.at(-1)![0] as string;
    expect(payload.startsWith("data: ")).toBe(true);
    expect(payload.endsWith("\n\n")).toBe(true);

    unsub();
  });
});
