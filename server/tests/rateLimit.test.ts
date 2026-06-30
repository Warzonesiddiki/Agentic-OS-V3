import { describe, it, expect } from "vitest";

process.env.DATABASE_URL ??= "postgres://p:pass@localhost:5432/nexus_test";
process.env.NODE_ENV ??= "test";
process.env.NEXUS_RATE_LIMIT_PER_MINUTE ??= "60";

import { consume, clientIpFromHeaders } from "../src/lib/rate-limit.js";

describe("rate limiter — token bucket", () => {
  it("allows requests within budget", async () => {
    const result = await consume("test-ip-1", "test");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it("returns remaining count", async () => {
    const r1 = await consume("test-ip-counter", "test");
    expect(r1.remaining).toBeGreaterThanOrEqual(0);
  });

  it("different keys have independent buckets", async () => {
    const r1 = await consume("key-a", "test");
    const r2 = await consume("key-b", "test");
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });
});

describe("rate limiter — client IP extraction", () => {
  it("returns fallback when no headers", () => {
    const ip = clientIpFromHeaders({}, "192.168.1.1");
    expect(ip).toBe("192.168.1.1");
  });

  it("returns unknown when no fallback", () => {
    const ip = clientIpFromHeaders({});
    expect(ip).toBe("unknown");
  });

  it("uses x-forwarded-for header", () => {
    const ip = clientIpFromHeaders({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }, "10.0.0.1");
    expect(ip).toBe("1.2.3.4");
  });

  it("handles array x-forwarded-for", () => {
    const ip = clientIpFromHeaders({ "x-forwarded-for": ["3.3.3.3", "4.4.4.4"] }, "10.0.0.1");
    expect(ip).toBe("3.3.3.3");
  });
});
