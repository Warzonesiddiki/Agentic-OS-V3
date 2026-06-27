/**
 * Audit hash-chain unit tests — pure, no database required.
 * Verifies the canonical-hash computation and chaining logic that the
 * transactional append/verify also rely on.
 */
import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://p:pass@localhost:5432/nexus_test";
});

import { computeEntryHash, stableStringify, GENESIS_HASH } from "../src/lib/audit.js";

describe("stable serialization", () => {
  it("is order-independent", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });
  it("differs for different values", () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});

describe("hash chain", () => {
  it("produces deterministic, 64-char hex hashes", () => {
    const h = computeEntryHash(GENESIS_HASH, 1, "test.action", "tester", 0, { a: 1 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    // Determinism.
    expect(h).toBe(computeEntryHash(GENESIS_HASH, 1, "test.action", "tester", 0, { a: 1 }));
  });

  it("chains: each entry's hash depends on the previous", () => {
    const base = (prev: string) => computeEntryHash(prev, 1, "x", "y", 0, {});
    expect(base(GENESIS_HASH)).not.toBe(base("abc"));
  });

  it("is sensitive to payload (tamper evidence)", () => {
    const h1 = computeEntryHash(GENESIS_HASH, 1, "a", "x", 0, { amount: 10 });
    const h2 = computeEntryHash(GENESIS_HASH, 1, "a", "x", 0, { amount: 1000 });
    expect(h1).not.toBe(h2);
  });
});
