/**
 * ID generation helpers for NEXUS 2.0.
 *
 * `buuid` produces a base62-encoded UUID derived from crypto.randomUUID()
 * for short, URL-safe, sortable-ish identifiers used across the kernel,
 * scheduler, and enterprise services.
 */

import { randomUUID } from 'node:crypto';

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function toBase62(bytes: Uint8Array): string {
  let value = 0n;
  for (const b of bytes) {
    value = (value << 8n) | BigInt(b);
  }
  let out = '';
  while (value > 0n) {
    out = BASE62[Number(value % 62n)] + out;
    value /= 62n;
  }
  return out || '0';
}

/** Generate a short base62 UUID (22 chars). */
export function buuid(): string {
  return toBase62(Uint8Array.from(Buffer.from(randomUUID().replace(/-/g, ''), 'hex')));
}

/** Generate a standard RFC-4122 v4 UUID. */
export function uuid(): string {
  return randomUUID();
}

/** Alias used by orchestration modules. */
export const randomId = buuid;
