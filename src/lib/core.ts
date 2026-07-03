/**
 * core.ts — foundational utilities for NEXUS 2.0.
 * Cryptographic hashing (WASM-accelerated SHA-256 via hash-wasm, with pure-JS
 * fallback), constant-time comparison, deterministic serialization, token
 * estimation, lexical (BM25) search, and formatting helpers.
 */

export const GENESIS_HASH = "0".repeat(64);

let _idCounter = 0;
export function rid(prefix = ""): string {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${(_idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${uuid}` : uuid;
}

export function now(): number {
  return Date.now();
}
export function isoNow(): string {
  return new Date().toISOString();
}

/** Deterministic JSON serialization — keys sorted recursively. Used for audit hashing. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

/* ------------------------------------------------------------------ *
 * WASM-accelerated SHA-256. Uses hash-wasm when available (embedded
 * WASM binary), falls back to pure-JS SHA-256 during initialization.
 * The engine stays synchronous: first N calls use JS fallback, then
 * all subsequent calls use the ~10× faster WASM path.
 * ------------------------------------------------------------------ */

// Lazy WASM instance — initialized in background at module load
let _wasmSha256: ((input: string) => string) | null = null;

async function initWasmSha256(): Promise<void> {
  try {
    const { createSHA256 } = await import("hash-wasm");
    const hasher = await createSHA256();
    _wasmSha256 = (input: string): string => {
      hasher.init();
      hasher.update(input);
      return hasher.digest("hex") as string;
    };
    // Verify against NIST vectors
    for (const v of NIST_VECTORS) {
      const got = _wasmSha256(v.input);
      if (got !== v.expected) {
        _wasmSha256 = null;
        import("./logger.js").then(({ logger }) => logger.error("core", "FATAL: WASM SHA-256 self-test FAILED"));
        break;
      }
    }
  } catch {
    // WASM not available — fall back to pure-JS permanently
  }
}
void initWasmSha256();

/* ------------------------------------------------------------------ *
 * Pure-JS SHA-256 fallback (FIPS 180-4). Only used while WASM is
 * loading or if WASM is unavailable.
 * ------------------------------------------------------------------ */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function utf8Bytes(input: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let c = input.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function jsSha256Hex(input: string): string {
  const bytes = utf8Bytes(input);
  const l = bytes.length;
  const bitLen = l * 8;
  const withOne = l + 1;
  const paddedLen = withOne + 8 + ((64 - ((withOne + 8) % 64)) % 64);
  const m = new Uint8Array(paddedLen);
  m.set(bytes);
  m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(paddedLen - 4, bitLen >>> 0, false);
  dv.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const W = new Uint32Array(64);

  for (let chunk = 0; chunk < paddedLen; chunk += 64) {
    for (let t = 0; t < 16; t++) W[t] = dv.getUint32(chunk + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }

  let hex = "";
  for (let i = 0; i < 8; i++) hex += H[i].toString(16).padStart(8, "0");
  return hex;
}

export function sha256Hex(input: string): string {
  if (_wasmSha256) return _wasmSha256(input);
  return jsSha256Hex(input);
}

/* ------------------------------------------------------------------ *
 * SHA-256 self-test against official NIST test vectors (FIPS 180-2/4).
 * Runs at module load against whichever backend is active.
 * ------------------------------------------------------------------ */
const NIST_VECTORS: { input: string; expected: string }[] = [
  { input: "", expected: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  { input: "abc", expected: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" },
  { input: "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", expected: "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1" },
];

let _hashOk = true;
let _hashError: string | null = null;
(function verifySha256(): void {
  for (const v of NIST_VECTORS) {
    const got = sha256Hex(v.input);
    if (got !== v.expected) {
      _hashOk = false;
      _hashError = `sha256("${v.input.slice(0, 12)}…") = ${got}, expected ${v.expected}`;
      import("./logger.js").then(({ logger }) => logger.error("core", "FATAL: SHA-256 self-test FAILED —", _hashError));
      break;
    }
  }
})();

export function hashOk(): boolean {
  return _hashOk;
}
export function hashError(): string | null {
  return _hashError;
}

/** Constant-time string comparison to mitigate timing attacks on secrets. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

/** Hash a secret with a domain separator so it is never stored or compared in raw form. */
export function hashSecret(secret: string): string {
  return sha256Hex(`nexus::v2::${secret}`);
}

/* ------------------------------------------------------------------ *
 * Tokens + lexical search
 * ------------------------------------------------------------------ */

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const t = text.trim();
  if (!t) return 0;
  return Math.max(1, Math.ceil(t.length / 4));
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "to", "of", "in", "on", "for",
  "with", "as", "by", "at", "it", "this", "that", "be", "from", "i", "you", "we", "they", "he", "she",
  "into", "your", "our", "my", "me", "do", "does", "did", "so", "if", "then", "than", "can", "will",
]);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 1 && !STOP.has(t));
}

/** BM25 lexical scoring. Returns a map of docId -> score for docs with score > 0. */
export function lexicalScores(
  docs: { id: string; text: string }[],
  query: string,
  k1 = 1.5,
  b = 0.75
): Map<string, number> {
  const qTerms = tokenize(query);
  const out = new Map<string, number>();
  if (!qTerms.length || !docs.length) return out;

  const N = docs.length;
  const df = new Map<string, number>();
  const prepared = docs.map((d) => {
    const tf = new Map<string, number>();
    let len = 0;
    for (const t of tokenize(d.text)) {
      tf.set(t, (tf.get(t) || 0) + 1);
      len++;
    }
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    return { id: d.id, tf, len };
  });
  const avgLen = prepared.reduce((s, x) => s + x.len, 0) / N || 1;

  for (const p of prepared) {
    let score = 0;
    for (const qt of qTerms) {
      const f = p.tf.get(qt) || 0;
      if (!f) continue;
      const d = df.get(qt) || 0;
      const idf = Math.log(1 + (N - d + 0.5) / (d + 0.5));
      const denom = f + k1 * (1 - b + b * (p.len / avgLen));
      score += (idf * (f * (k1 + 1))) / denom;
    }
    if (score > 0) out.set(p.id, score);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Formatting helpers
 * ------------------------------------------------------------------ */

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function timeAgo(ms: number | null): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  if (diff < 5000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function formatDateTime(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

export function shortHash(h: string | undefined, n = 10): string {
  if (!h) return "—";
  return h.length > n ? `${h.slice(0, n)}…` : h;
}
