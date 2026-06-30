/**
 * strings.ts — small pure string helpers (Node-safe, no DOM).
 */
export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}
