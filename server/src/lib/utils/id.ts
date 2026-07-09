import { randomUUID as cryptoRandomUUID } from 'node:crypto';

/**
 * Generate random UUID (version 4).
 */
export function generateUuid(): string {
  return cryptoRandomUUID();
}
