/**
 * Plugin-manifest unit tests — pure Zod validation, no database required.
 */
import { describe, it, expect } from "vitest";
import {
  validateManifest, safeValidateManifest, diffManifests,
  EXAMPLE_MANIFEST, PluginManifestSchema,
} from "../src/services/plugin-manifest.js";

const VALID_INPUT = {
  name: "io.nexus.test.summarizer",
  version: "1.0.0",
  description: "A test plugin.",
  capabilities: [{ exact: "llm.invoke" }],
  sandbox: { maxFuel: 1_000_000, maxWallMs: 5_000, maxOutputBytes: 1 << 20, allowNetwork: false, allowFilesystem: false, allowEnv: false },
  tags: ["test"],
};

describe("plugin-manifest — schema validation", () => {
  it("accepts a valid manifest", () => {
    const m = validateManifest(VALID_INPUT);
    expect(m.name).toBe("io.nexus.test.summarizer");
    expect(m.schemaVersion).toBe(1);
    expect(m.capabilities).toHaveLength(1);
    expect(m.capabilities[0]!.exact).toBe("llm.invoke");
  });

  it("fills defaults for optional fields", () => {
    const m = validateManifest({
      name: "io.nexus.minimal",
      version: "0.1.0",
      capabilities: [{ exact: "recall.query" }],
    });
    expect(m.description).toBe("");
    expect(m.tags).toEqual([]);
    expect(m.dependsOn).toEqual([]);
    expect(m.sandbox.allowNetwork).toBe(false);
    expect(m.sandbox.allowFilesystem).toBe(false);
    expect(m.ring).toBe(2);
  });

  it("rejects missing name", () => {
    expect(() => validateManifest({ version: "1.0.0", capabilities: [{ exact: "x" }] })).toThrow();
  });

  it("rejects invalid version format", () => {
    expect(() => validateManifest({ name: "x", version: "abc", capabilities: [{ exact: "x" }] })).toThrow();
  });

  it("rejects manifest with no capabilities", () => {
    expect(() => validateManifest({ name: "x", version: "1.0.0", capabilities: [] })).toThrow();
  });

  it("rejects capabilities with neither exact nor prefix", () => {
    expect(() => validateManifest({
      name: "x", version: "1.0.0",
      capabilities: [{ limits: { maxBytes: 100 } }],
    })).toThrow();
  });

  it("rejects name shorter than 3 characters", () => {
    expect(() => validateManifest({ name: "ab", version: "1.0.0", capabilities: [{ exact: "x" }] })).toThrow();
  });
});

describe("plugin-manifest — safeValidateManifest", () => {
  it("returns ok for valid input", () => {
    const r = safeValidateManifest(VALID_INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.name).toBe("io.nexus.test.summarizer");
  });

  it("returns errors for invalid input", () => {
    const r = safeValidateManifest({ name: "ab", version: "bad", capabilities: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("plugin-manifest — EXAMPLE_MANIFEST", () => {
  it("passes validation", () => {
    const m = validateManifest(EXAMPLE_MANIFEST);
    expect(m.name).toBe("io.nexus.examples.summarizer");
    expect(m.version).toBe("1.0.0");
  });
});

describe("plugin-manifest — diffManifests", () => {
  const base = PluginManifestSchema.parse({
    name: "test", version: "1.0.0",
    capabilities: [{ exact: "llm.invoke" }, { prefix: "skill.invoke." }],
    sandbox: { allowNetwork: false, allowFilesystem: false, allowEnv: false },
  });

  it("detects added capabilities", () => {
    const next = { ...base, version: "1.1.0", capabilities: [{ exact: "llm.invoke" }, { prefix: "skill.invoke." }, { exact: "vault.read" }] };
    const d = diffManifests(base, next);
    expect(d.added).toContain("vault.read");
    expect(d.to).toBe("1.1.0");
  });

  it("detects removed capabilities", () => {
    const next = { ...base, version: "1.1.0", capabilities: [{ exact: "llm.invoke" }] };
    const d = diffManifests(base, next);
    expect(d.removed).toContain("skill.invoke.");
  });

  it("detects sandbox changes", () => {
    const next = { ...base, version: "1.1.0", sandbox: { ...base.sandbox, allowNetwork: true } };
    const d = diffManifests(base, next);
    expect(d.changed).toContain("sandbox");
  });

  it("detects ring changes", () => {
    const next = { ...PluginManifestSchema.parse({
      name: "test", version: "1.1.0", ring: 0,
      capabilities: [{ exact: "llm.invoke" }],
      sandbox: { allowNetwork: false, allowFilesystem: false, allowEnv: false },
    }) };
    const d = diffManifests(base, next);
    expect(d.changed).toContain("ring");
  });

  it("reports no changes for identical manifests", () => {
    const d = diffManifests(base, PluginManifestSchema.parse({ ...base, version: "1.0.0", capabilities: [{ exact: "llm.invoke" }, { prefix: "skill.invoke." }] }));
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(d.changed).toHaveLength(0);
  });
});
