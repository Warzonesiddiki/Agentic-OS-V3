import { describe, it, expect, vi } from "vitest";

const onMock = vi.fn();
const broadcastMock = vi.fn();

vi.mock("../src/services/message-bus.js", () => ({
  getMessageBus: () => ({ on: onMock }),
}));
vi.mock("../src/services/sse-bus.js", () => ({
  broadcastSSE: broadcastMock,
}));

import { initializeSseBridge } from "../src/services/sse-bridge.js";

describe("sse-bridge", () => {
  it("subscribes to the message bus and forwards events to SSE", () => {
    initializeSseBridge();

    expect(onMock).toHaveBeenCalledTimes(1);
    expect(onMock).toHaveBeenCalledWith("message", expect.any(Function));

    const handler = onMock.mock.calls[0]?.[1] as (
      msg: { type: string; payload: unknown; createdAt: number },
    ) => void;
    handler({ type: "x", payload: { foo: 1 }, createdAt: 42 });

    expect(broadcastMock).toHaveBeenCalledExactlyOnceWith({
      type: "x",
      data: { foo: 1 },
      timestamp: 42,
    });
  });
});
