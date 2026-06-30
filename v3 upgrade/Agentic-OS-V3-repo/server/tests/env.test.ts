/**
 * Environment config unit tests — validates env schema parsing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("env validation", () => {
  beforeEach(() => {
    // Reset module cache between tests
    vi.resetModules();
  });

  it("parses default values correctly", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/test";
    process.env.NODE_ENV = "development";
    const env = await import("../src/lib/env.js");
    const e = env.getEnv();
    expect(e.PORT).toBe(9900);
    expect(e.NODE_ENV).toBe("development");
    expect(e.NEXUS_RATE_LIMIT_PER_MINUTE).toBe(120);
    expect(e.NEXUS_BUS_BACKEND).toBe("memory");
  });

  it("throws if DATABASE_URL is missing", async () => {
    // Mock dotenv to prevent it from reloading DATABASE_URL from .env
    vi.doMock("dotenv", () => ({ config: vi.fn() }));
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "development";
    const env = await import("../src/lib/env.js");
    expect(() => env.getEnv()).toThrow(/DATABASE_URL/);
  });

  it("parses NEXUS_OTEL_ENDPOINT when set", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/test";
    process.env.NODE_ENV = "development";
    process.env.NEXUS_OTEL_ENDPOINT = "http://otel-collector:4318/v1/traces";
    const env = await import("../src/lib/env.js");
    const e = env.getEnv();
    expect(e.NEXUS_OTEL_ENDPOINT).toBe("http://otel-collector:4318/v1/traces");
  });
});
