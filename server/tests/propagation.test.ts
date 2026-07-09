import { describe, it, expect } from "vitest";
import {
  parseTraceparent,
  formatTraceparent,
  extractTraceparent,
  injectTraceparent,
} from "../src/services/propagation.js";

describe("parseTraceparent", () => {
  it("parses a valid W3C traceparent header", () => {
    const ctx = parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
    expect(ctx).not.toBeNull();
    expect(ctx!.version).toBe("00");
    expect(ctx!.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(ctx!.spanId).toBe("00f067aa0ba902b7");
    expect(ctx!.flags).toBe("01");
  });

  it("lowercases hex", () => {
    const ctx = parseTraceparent("00-ABCDEF0123456789ABCDEF0123456789-AABBCCDDEEFF0011-01");
    expect(ctx!.traceId).toBe("abcdef0123456789abcdef0123456789");
    expect(ctx!.spanId).toBe("aabbccddeeff0011");
  });

  it("returns null for null/undefined/empty", () => {
    expect(parseTraceparent(null)).toBeNull();
    expect(parseTraceparent(undefined)).toBeNull();
    expect(parseTraceparent("")).toBeNull();
  });

  it("returns null for malformed headers", () => {
    expect(parseTraceparent("not-a-traceparent")).toBeNull();
    expect(parseTraceparent("00-tooshort-00f067aa0ba902b7-01")).toBeNull();
    expect(parseTraceparent("zz-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBeNull();
  });

  it("rejects non-zero versions", () => {
    expect(parseTraceparent("ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    const ctx = parseTraceparent("  00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01  ");
    expect(ctx).not.toBeNull();
  });
});

describe("formatTraceparent", () => {
  it("round-trips with parseTraceparent", () => {
    const raw = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const ctx = parseTraceparent(raw)!;
    expect(formatTraceparent(ctx)).toBe(raw);
  });

  it("defaults flags to 01 when missing", () => {
    const out = formatTraceparent({ version: "00", traceId: "a".repeat(32), spanId: "b".repeat(16) });
    expect(out.endsWith("-01")).toBe(true);
  });
});

describe("extractTraceparent", () => {
  it("extracts from a plain headers object (case-insensitive)", () => {
    const ctx = extractTraceparent({ TRACEPARENT: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" });
    expect(ctx!.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
  });

  it("extracts from an array-valued header (takes first)", () => {
    const ctx = extractTraceparent({ traceparent: ["00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01", "other"] });
    expect(ctx).not.toBeNull();
  });

  it("extracts from a Headers instance", () => {
    const h = new Headers();
    h.set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
    const ctx = extractTraceparent(h);
    expect(ctx!.spanId).toBe("00f067aa0ba902b7");
  });

  it("returns null when header absent", () => {
    expect(extractTraceparent({})).toBeNull();
  });
});

describe("injectTraceparent", () => {
  it("writes traceparent into a headers object when ctx provided", () => {
    const headers: Record<string, string> = {};
    const out = injectTraceparent(headers, { version: "00", traceId: "a".repeat(32), spanId: "b".repeat(16), flags: "01" });
    expect(out.traceparent).toBe("00-" + "a".repeat(32) + "-" + "b".repeat(16) + "-01");
  });

  it("does not write traceparent when ctx is undefined", () => {
    const headers: Record<string, string> = {};
    injectTraceparent(headers, undefined);
    expect(headers.traceparent).toBeUndefined();
  });

  it("returns the same headers reference", () => {
    const headers: Record<string, string> = {};
    expect(injectTraceparent(headers, undefined)).toBe(headers);
  });
});
