import { describe, it, expect, beforeEach } from "vitest";

process.env.DATABASE_URL ??= "postgres://p:pass@localhost:5432/nexus_test";
process.env.NODE_ENV ??= "test";

import { getMessageBus, resetMessageBus, type BusMessage } from "../src/services/message-bus.js";

describe("message bus", () => {
  beforeEach(() => {
    resetMessageBus();
  });

  it("publishes and subscribes to messages", () => {
    const bus = getMessageBus();
    const received: BusMessage[] = [];
    bus.subscribe("test-sub", "system/**", (msg) => { received.push(msg); });
    bus.publish("test.event", "test", undefined, { hello: "world" }, "event", "system/test");
    expect(received.length).toBe(1);
    expect(received[0]?.type).toBe("test.event");
    expect(received[0]?.payload).toEqual({ hello: "world" });
  });

  it("topic matching with wildcards", () => {
    const bus = getMessageBus();
    const received: BusMessage[] = [];
    bus.subscribe("sub1", "agent/*", (msg) => { received.push(msg); });
    bus.publish("cmd.test", "sender", "agent-1", {}, "command", "agent/test");
    expect(received.length).toBe(1);
  });

  it("supports unsubscribe", () => {
    const bus = getMessageBus();
    const received: BusMessage[] = [];
    const sub = bus.subscribe("test-sub", "**", (msg) => { received.push(msg); });
    bus.publish("e1", "t", undefined, {}, "event", "x");
    expect(received.length).toBe(1);
    bus.unsubscribe(sub.id);
    bus.publish("e2", "t", undefined, {}, "event", "x");
    expect(received.length).toBe(1);
  });

  it("returns stats", () => {
    const bus = getMessageBus();
    bus.publish("e1", "t", undefined, {}, "event", "x");
    const stats = bus.getStats();
    expect(stats.messagesPublished).toBe(1);
  });
});
