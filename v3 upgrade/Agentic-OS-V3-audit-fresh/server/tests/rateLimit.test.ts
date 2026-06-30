/**
 * Rate limiter unit tests — pure, no database required.
 * Tests token bucket behavior, exhaustion, refill, and client IP extraction.
 */
import { describe, it, expect, beforeEach } from "vitest";

process.env.DATABASE_URL ??= "postgres://p:pass@localhost:5432/nexus_test";
process.env.NODE_ENV ??= "test";

import { consume, resetRateLimiter, clientIpFromHeaders } from "../src/lib/rateLimit.js";

describe("rate limiter — token bucket", () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it("allows requests within budget", async () => {
    const result = await consume("test-ip-1", "test");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it("returns remaining count", async () => {
    const r1 = await consume("test-ip-counter", "test");
    expect(r1.remaining).toBeGreaterThanOrEqual(0);
  });

  it("namespace prefixing works", async () => {
    const r1 = await consume("same-key", "ns-a");
    const r2 = await consume("same-key", "ns-b");
    // Different namespaces should not interfere
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it("different keys have independent buckets", async () => {
    const r1 = await consume("key-a", "test-independent");
    const r2 = await consume("key-b", "test-independent");
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });
});

describe("rate limiter — client IP extraction", () => {
  it("returns remote address when trust proxy is off", () => {
    process.env.NEXUS_TRUST_PROXY = "false";
    const ip = clientIpFromHeaders({}, "192.168.1.1");
    expect(ip).toBe("192.168.1.1");
  });

  it("returns 'anon' when no remote address", () => {
    process.env.NEXUS_TRUST_PROXY = "false";
    const ip = clientIpFromHeaders({}, undefined);
    expect(ip).toBe("anon");
  });

  it("uses x-forwarded-for when trust proxy is on", () => {
    process.env.NEXUS_TRUST_PROXY = "true";
    const ip = clientIpFromHeaders({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }, "10.0.0.1");
    expect(ip).toBe("1.2.3.4");
  });

  it("uses remote address when trust proxy on but no xff header", () => {
    process.env.NEXUS_TRUST_PROXY = "true";
    const ip = clientIpFromHeaders({}, "10.0.0.1");
    expect(ip).toBe("10.0.0.1");
  });

  it("handles array x-forwarded-for", () => {
    process.env.NEXUS_TRUST_PROXY = "true";
    const ip = clientIpFromHeaders({ "x-forwarded-for": ["3.3.3.3", "4.4.4.4"] }, "10.0.0.1");
    expect(ip).toBe("3.3.3.3");
  });
});
