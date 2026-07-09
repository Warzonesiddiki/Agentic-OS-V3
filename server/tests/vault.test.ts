/**
 * Guards + vault-parsing unit tests — pure, no database required.
 */
import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://p:pass@localhost:5432/nexus_test";
});

import { safeVaultPath, assertPublicHost } from "../src/lib/guards.js";
import { parseMarkdown } from "../src/services/vault.js";

describe("vault path safety", () => {
  it("accepts in-root paths", () => {
    expect(safeVaultPath("notes/idea.md", "/vault").ok).toBe(true);
    expect(safeVaultPath("sub/dir/idea.md", "/vault").ok).toBe(true);
  });
  it("rejects parent traversal", () => {
    expect(safeVaultPath("../../etc/passwd", "/vault").ok).toBe(false);
    expect(safeVaultPath("notes/../../../etc/shadow", "/vault").ok).toBe(false);
  });
  it("rejects absolute escapes", () => {
    expect(safeVaultPath("/etc/passwd", "/vault").ok).toBe(false);
  });
  it("rejects null bytes", () => {
    expect(safeVaultPath("safe\0evil.md", "/vault").ok).toBe(false);
  });
});

describe("markdown parsing", () => {
  it("parses frontmatter, heading, tags, and wikilinks", () => {
    const md = `---
title: Recall Strategy
tags: [search, recall]
---
# Recall Strategy
Uses [[token-ledger]] and [[bm25]].
Also inline #ranking note.`;
    const p = parseMarkdown(md);
    expect(p.title).toBe("Recall Strategy");
    expect(p.frontmatter.title).toBe("Recall Strategy");
    expect(p.tags).toContain("search");
    expect(p.tags).toContain("recall");
    expect(p.tags).toContain("ranking");
    expect(p.wikilinks).toEqual(expect.arrayContaining(["token-ledger", "bm25"]));
  });

  it("falls back to filename-style title when no frontmatter/heading", () => {
    const p = parseMarkdown("just some body text");
    expect(p.title).toBe("untitled");
    expect(p.tags).toEqual([]);
  });
});

describe("SSRF enforcement", () => {
  it("blocks private hosts synchronously", () => {
    // assertPublicHost resolves DNS, but private literal hosts are blocked first.
    return expect(assertPublicHost("127.0.0.1")).rejects.toThrow(/private/);
  });
  it("blocks link-local metadata host", () => {
    return expect(assertPublicHost("169.254.169.254")).rejects.toThrow(/private/);
  });
});
