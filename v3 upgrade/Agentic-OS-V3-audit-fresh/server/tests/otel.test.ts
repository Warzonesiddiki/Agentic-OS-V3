/**
 * OpenTelemetry unit tests — pure, no database required.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("otel module", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/test";
    process.env.NODE_ENV = "development";
    vi.resetModules();
  });

  it("isOtelEnabled returns false when endpoint is not set", async () => {
    delete process.env.NEXUS_OTEL_ENDPOINT;
    const { isOtelEnabled } = await import("../src/lib/otel.js");
    expect(isOtelEnabled()).toBe(false);
  });

  it("initOtel resolves without error when disabled", async () => {
    delete process.env.NEXUS_OTEL_ENDPOINT;
    const { initOtel } = await import("../src/lib/otel.js");
    await expect(initOtel()).resolves.toBeUndefined();
  });

  it("isOtelEnabled returns true when endpoint is set", async () => {
    process.env.NEXUS_OTEL_ENDPOINT = "http://localhost:4318";
    const { isOtelEnabled } = await import("../src/lib/otel.js");
    expect(isOtelEnabled()).toBe(true);
  });
});
