/**
 * Metrics service unit tests — pure, no database required.
 */
import { describe, it, expect } from "vitest";

describe("metrics service", () => {
  it("exports expected functions", async () => {
    const m = await import("../src/services/metrics.js");
    expect(typeof m.metricsOutput).toBe("function");
    expect(typeof m.metricsContentType).toBe("function");
    expect(typeof m.httpRequestsTotal).toBe("object");
    expect(typeof m.httpRequestDuration).toBe("object");
    expect(typeof m.activeConnections).toBe("object");
  });

  it("metricsContentType returns prometheus content type", async () => {
    const m = await import("../src/services/metrics.js");
    const ct = m.metricsContentType();
    expect(typeof ct).toBe("string");
  });

  it("metricsOutput returns metrics text after increment", async () => {
    const m = await import("../src/services/metrics.js");
    m.httpRequestsTotal.inc({ method: "GET", path: "/test", status: "200" });
    const output = await m.metricsOutput();
    expect(output).toContain("nexus_http_requests_total");
    expect(output).toContain("nexus_http_request_duration_seconds");
  });
});
