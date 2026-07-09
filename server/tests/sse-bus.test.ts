import { describe, it, expect, vi, afterEach } from "vitest";
import {
  addSSEClient,
  getSSEClientCount,
  broadcastSSE,
} from "../src/services/sse-bus.js";

type Writer = { write: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };

const removals: Array<() => void> = [];

function track(writer: Writer): Writer {
  removals.push(addSSEClient(writer));
  return writer;
}

afterEach(() => {
  while (removals.length) removals.pop()?.();
});

describe("sse-bus", () => {
  it("tracks client count on add/remove", () => {
    const w: Writer = { write: vi.fn(), close: vi.fn() };
    const remove = addSSEClient(w);
    expect(getSSEClientCount()).toBe(1);
    remove();
    expect(getSSEClientCount()).toBe(0);
  });

  it("broadcasts a formatted SSE frame to every client", () => {
    const w1 = track({ write: vi.fn(), close: vi.fn() });
    const w2 = track({ write: vi.fn(), close: vi.fn() });

    broadcastSSE({ type: "tick", data: { a: 1 }, timestamp: 123 });

    const expected = `event: tick\ndata: ${JSON.stringify({ a: 1 })}\n\n`;
    expect(w1.write).toHaveBeenCalledExactlyOnceWith(expected);
    expect(w2.write).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it("removes a client that throws on write", () => {
    const good = track({ write: vi.fn(), close: vi.fn() });
    const bad = track({ write: () => { throw new Error("x"); }, close: vi.fn() });

    const before = getSSEClientCount();
    broadcastSSE({ type: "t", data: {}, timestamp: 1 });

    expect(getSSEClientCount()).toBe(before - 1);
    expect(good.write).toHaveBeenCalled();
    // bad was removed, so it should not still be in the set
  });

  it("broadcasts to zero clients without error", () => {
    expect(() =>
      broadcastSSE({ type: "noop", data: null, timestamp: 0 }),
    ).not.toThrow();
  });
});
