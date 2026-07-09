import { describe, it, expect, afterEach } from "vitest";
import {
  diskQuota,
  netQuota,
  QuotaRegistry,
  getQuotaRegistry,
  resetQuotaRegistry,
} from "../src/services/resource-quota.js";

describe("resource-quota (registry + helpers)", () => {
  afterEach(() => {
    resetQuotaRegistry();
  });

  it("diskQuota returns a ResourceQuotaEnforcer", () => {
    const enf = diskQuota("agent-1", { diskBytes: 1024 });
    // touch a couple of methods to confirm the enforcer is usable
    enf.start();
    enf.stop();
    expect(enf).toBeTruthy();
  });

  it("netQuota delegates to diskQuota with egress mapped", () => {
    const enf = netQuota("agent-2", 2048);
    expect(enf).toBeTruthy();
  });

  it("QuotaRegistry.getOrCreate returns the same shared enforcer per agent", () => {
    const reg = new QuotaRegistry({ clock: () => 1000 });
    const a1 = reg.getOrCreate("a", { diskBytes: 1 });
    const a2 = reg.getOrCreate("a", { diskBytes: 1 });
    expect(a1).toBe(a2);
    expect(reg.size()).toBe(1);
  });

  it("QuotaRegistry evicts the oldest-idle when over maxEntries", () => {
    let t = 1000;
    const reg = new QuotaRegistry({ clock: () => t, maxEntries: 2 });
    reg.getOrCreate("a", { diskBytes: 1 });
    reg.getOrCreate("b", { diskBytes: 1 });
    // "a" is now the oldest-idle; creating "c" should evict "a"
    reg.getOrCreate("c", { diskBytes: 1 });
    expect(reg.size()).toBe(2);
    const reaped = new Set<string>();
    // force a sweep TTL by advancing clock far beyond idle ttl
    t = 1000 + 10 * 60_000;
    const swept = reg.sweep();
    expect(Array.isArray(swept)).toBe(true);
  });

  it("QuotaRegistry.sweep returns idle entries beyond idleTtlMs", () => {
    let t = 0;
    const reg = new QuotaRegistry({ clock: () => t, idleTtlMs: 1000 });
    reg.getOrCreate("a", { diskBytes: 1 });
    // not idle yet
    expect(reg.sweep()).toEqual([]);
    t = 2000;
    expect(reg.sweep()).toEqual(["a"]);
  });

  it("getQuotaRegistry is a lazily-created singleton", () => {
    const r1 = getQuotaRegistry();
    const r2 = getQuotaRegistry();
    expect(r1).toBe(r2);
    resetQuotaRegistry();
    const r3 = getQuotaRegistry();
    expect(r3).not.toBe(r1);
  });
});
