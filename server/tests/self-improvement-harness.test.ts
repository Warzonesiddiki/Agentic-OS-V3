/**
 * Self-improvement-harness unit tests — pure functions only, no database required.
 * Tests detection logic, metric summarization, and budget calculations.
 */
import { describe, it, expect } from "vitest";
import { detectRegression, type MetricWindow } from "../src/services/self-improvement-harness.js";

describe("self-improvement — detectRegression", () => {
  it("detects regression when p95 increases beyond threshold", () => {
    const current: MetricWindow = {
      metric: "test", values: [], p50: 100, p95: 200, mean: 150, n: 50,
    };
    const baseline: MetricWindow = {
      metric: "test", values: [], p50: 50, p95: 100, mean: 75, n: 50,
    };
    expect(detectRegression(current, baseline, 0.10)).toBe(true);
  });

  it("returns false when p95 is within threshold", () => {
    const current: MetricWindow = {
      metric: "test", values: [], p50: 52, p95: 105, mean: 78, n: 50,
    };
    const baseline: MetricWindow = {
      metric: "test", values: [], p50: 50, p95: 100, mean: 75, n: 50,
    };
    expect(detectRegression(current, baseline, 0.10)).toBe(false);
  });

  it("returns false when current window is empty", () => {
    const current: MetricWindow = {
      metric: "test", values: [], p50: 0, p95: 0, mean: 0, n: 0,
    };
    const baseline: MetricWindow = {
      metric: "test", values: [], p50: 100, p95: 200, mean: 150, n: 50,
    };
    expect(detectRegression(current, baseline, 0.10)).toBe(false);
  });

  it("returns false when baseline window is empty", () => {
    const current: MetricWindow = {
      metric: "test", values: [], p50: 100, p95: 200, mean: 150, n: 50,
    };
    const baseline: MetricWindow = {
      metric: "test", values: [], p50: 0, p95: 0, mean: 0, n: 0,
    };
    expect(detectRegression(current, baseline, 0.10)).toBe(false);
  });

  it("uses custom threshold", () => {
    const current: MetricWindow = {
      metric: "test", values: [], p50: 100, p95: 110, mean: 105, n: 50,
    };
    const baseline: MetricWindow = {
      metric: "test", values: [], p50: 50, p95: 100, mean: 75, n: 50,
    };
    // 10% increase is within 15% threshold
    expect(detectRegression(current, baseline, 0.15)).toBe(false);
    // but exceeds 5% threshold
    expect(detectRegression(current, baseline, 0.05)).toBe(true);
  });

  it("returns false when both p95s are zero", () => {
    const current: MetricWindow = {
      metric: "test", values: [], p50: 0, p95: 0, mean: 0, n: 50,
    };
    const baseline: MetricWindow = {
      metric: "test", values: [], p50: 0, p95: 0, mean: 0, n: 50,
    };
    expect(detectRegression(current, baseline, 0.10)).toBe(false);
  });

  it("handles improvement (negative delta) correctly", () => {
    const current: MetricWindow = {
      metric: "test", values: [], p50: 50, p95: 80, mean: 65, n: 50,
    };
    const baseline: MetricWindow = {
      metric: "test", values: [], p50: 100, p95: 200, mean: 150, n: 50,
    };
    // 60% improvement should not trigger regression
    expect(detectRegression(current, baseline, 0.10)).toBe(false);
  });
});
