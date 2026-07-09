import { describe, it, expect, vi, beforeEach } from "vitest";

// Isolate task-notifier from a real database by stubbing the db client module.
// In sqlite mode (isSqlite = true) notifyTaskQueued fans out to in-process
// listeners; the postgres branch is a no-op when getPgClient() returns null.
vi.mock("../src/db/client.js", () => ({
  isSqlite: true,
  getPgClient: () => null,
}));

import { onTaskQueued, notifyTaskQueued } from "../src/services/task-notifier.js";

describe("task-notifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a listener and returns an unsubscribe function", () => {
    const cb = vi.fn();
    const unsub = onTaskQueued(cb);
    expect(typeof unsub).toBe("function");

    notifyTaskQueued("task-1");
    expect(cb).toHaveBeenCalledExactlyOnceWith("task-1");

    unsub();
    notifyTaskQueued("task-2");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("supports multiple independent listeners", () => {
    const a = vi.fn();
    const b = vi.fn();
    const ua = onTaskQueued(a);
    const ub = onTaskQueued(b);

    notifyTaskQueued("x");
    expect(a).toHaveBeenCalledExactlyOnceWith("x");
    expect(b).toHaveBeenCalledExactlyOnceWith("x");

    ua();
    ub();
    notifyTaskQueued("y");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("isolates listener errors and still notifies the rest", () => {
    const good = vi.fn();
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const ua = onTaskQueued(bad);
    const ub = onTaskQueued(good);

    expect(() => notifyTaskQueued("y")).not.toThrow();
    expect(good).toHaveBeenCalledExactlyOnceWith("y");

    ua();
    ub();
  });

  it("handles double unsubscribe without throwing", () => {
    const cb = vi.fn();
    const unsub = onTaskQueued(cb);
    unsub();
    expect(() => unsub()).not.toThrow();
  });
});
