/**
 * perf-cache unit tests — pure TTL cache logic, no database required.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TTLCache } from "../src/lib/perf-cache.js";

describe("TTLCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined on miss", () => {
    const cache = new TTLCache<string, number>("test", 10, 1000);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("returns stored value on hit", () => {
    const cache = new TTLCache<string, number>("test", 10, 1000);
    cache.set("a", 42);
    expect(cache.get("a")).toBe(42);
  });

  it("expires entries after TTL", () => {
    const cache = new TTLCache<string, number>("test", 10, 1000);
    cache.set("a", 42);
    vi.advanceTimersByTime(1001);
    expect(cache.get("a")).toBeUndefined();
  });

  it("supports custom TTL per entry", () => {
    const cache = new TTLCache<string, number>("test", 10, 1000);
    cache.set("a", 42, 500);
    vi.advanceTimersByTime(600);
    expect(cache.get("a")).toBeUndefined();
  });

  it("evicts oldest entry when at capacity", () => {
    const cache = new TTLCache<string, number>("test", 2, 10000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.size).toBe(2);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("delete removes entry", () => {
    const cache = new TTLCache<string, number>("test", 10, 1000);
    cache.set("a", 42);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
  });

  it("clear removes all entries", () => {
    const cache = new TTLCache<string, number>("test", 10, 1000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("reports correct size", () => {
    const cache = new TTLCache<string, number>("test", 10, 1000);
    expect(cache.size).toBe(0);
    cache.set("a", 1);
    expect(cache.size).toBe(1);
    cache.set("b", 2);
    expect(cache.size).toBe(2);
  });

  it("overwrites existing key without eviction", () => {
    const cache = new TTLCache<string, number>("test", 2, 10000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 3);
    expect(cache.size).toBe(2);
    expect(cache.get("a")).toBe(3);
  });
});
