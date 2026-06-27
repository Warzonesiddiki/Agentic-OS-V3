/**
 * vault.ts — Obsidian-style markdown parsing and vault path safety.
 * Pure helpers shared by the vault bridge and the Safety Lab.
 */

export interface ParsedNote {
  path: string;
  title: string;
  content: string;
  frontmatter: Record<string, string>;
  tags: string[];
  wikilinks: string[];
}

/** Parse a markdown blob into frontmatter, tags, and wikilinks (Obsidian-compatible). */
export function parseMarkdown(path: string, raw: string): ParsedNote {
  let body = raw;
  const frontmatter: Record<string, string> = {};
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fm) {
    body = raw.slice(fm[0].length);
    for (const line of fm[1].split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx > 0) {
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim().replace(/^\[|\]$/g, "");
        if (k) frontmatter[k] = v;
      }
    }
  }

  const heading = body.match(/^#\s+(.+)$/m);
  const fileName = path.split("/").pop()?.replace(/\.md$/i, "") ?? "untitled";
  const title = (frontmatter.title || heading?.[1]?.trim() || fileName).trim();

  const tagSet = new Set<string>();
  if (frontmatter.tags) {
    frontmatter.tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((t) => tagSet.add(t.toLowerCase().replace(/^#/, "")));
  }
  for (const m of body.matchAll(/(?:^|\s)#([a-z][a-z0-9_/-]*)/gi)) tagSet.add(m[1].toLowerCase());

  const wikilinks = Array.from(
    new Set([...body.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)].map((m) => m[1].trim()))
  );

  return { path, title, content: body.trim(), frontmatter, tags: [...tagSet], wikilinks };
}

/** Resolve a user-supplied path and ensure it can never escape /vault. */
export function safeVaultFile(rawPath: string): { ok: boolean; resolved: string; reason?: string } {
  let p = rawPath.trim();
  if (!p) return { ok: false, resolved: "", reason: "Empty path." };
  if (p.includes("\0")) return { ok: false, resolved: p, reason: "Null byte detected." };
  if (!p.startsWith("/")) p = "/" + p;
  if (!p.startsWith("/vault/")) p = "/vault/" + p.replace(/^\/+/, "");
  if (/(^|\/)\.\.(\/|$)/.test(p)) return { ok: false, resolved: p, reason: "Path traversal detected (..)." };

  const resolved = p.replace(/\/+/g, "/");
  const parts = resolved.split("/").filter(Boolean);
  if (parts[0] !== "vault") return { ok: false, resolved, reason: "Path must remain inside /vault." };

  let depth = 0;
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") depth--;
    else depth++;
    if (depth < 1) return { ok: false, resolved, reason: "Path escapes vault root." };
  }
  return { ok: true, resolved };
}
