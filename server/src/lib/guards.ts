/**
 * guards.ts — security checks that gate the perimeter.
 * Real classification logic (no network/filesystem side effects in checks).
 */
import { lookup } from "node:dns/promises";
import path from "node:path";

const INJECTION = [
  /ignore (?:all )?(?:previous|prior) instructions/i,
  /disregard (?:the )?(?:above|previous|system)/i,
  /reveal (?:your )?(?:system )?prompt/i,
  /(?:print|show|output) (?:your )?(?:system )?prompt/i,
  /\[system\]/i,
  /act as (?:if )?(?:you are|an? )/i,
];

export function detectPromptInjection(text: string): { found: boolean; score: number; matches: string[] } {
  const matches: string[] = [];
  for (const re of INJECTION) {
    const m = text.match(re);
    if (m) matches.push(m[0].slice(0, 40));
  }
  return { found: matches.length > 0, score: Math.min(1, matches.length * 0.5), matches };
}

const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "AWS key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: "OpenAI key", re: /sk-[A-Za-z0-9]{20,}/ },
  { name: "Private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: "Generic secret", re: /(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"]?[A-Za-z0-9/+=_-]{8,}['"]?/i },
];

export function detectSecrets(text: string): { found: boolean; matches: string[] } {
  const matches: string[] = [];
  for (const p of SECRET_PATTERNS) {
    const m = text.match(p.re);
    if (m) matches.push(`${p.name}: ${m[0].slice(0, 16)}…`);
  }
  return { found: matches.length > 0, matches };
}

const PRIVATE_RE = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|169\.254\.|0\.|::1|fc00:|fe80:)/i;

export function isPrivateHost(host: string): boolean {
  if (!host) return false;
  const h = host.replace(/^\[|\]$/g, "").split(":")[0]!;
  if (h === "localhost") return true;
  return PRIVATE_RE.test(h);
}

/** Resolve a hostname and reject if any address is private/loopback (SSRF). */
export async function assertPublicHost(hostname: string): Promise<void> {
  if (isPrivateHost(hostname)) throw new Error(`Blocked private/loopback host: ${hostname}`);
  try {
    const res = await lookup(hostname, { all: true });
    for (const a of res) {
      if (isPrivateHost(a.address)) throw new Error(`Blocked resolved private address ${a.address} for ${hostname}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Blocked")) throw e;
    // DNS failures are treated as a denial — safer to fail closed.
    throw new Error(`DNS resolution failed for ${hostname}: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

/** Confine a vault path under root, rejecting traversal and null bytes. */
export function safeVaultPath(rawPath: string, root: string): { ok: boolean; resolved?: string; reason?: string } {
  if (rawPath.includes("\0")) return { ok: false, reason: "Null byte detected." };
  const resolved = path.resolve(root, rawPath);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return { ok: false, resolved, reason: "Path escapes vault root." };
  return { ok: true, resolved };
}
