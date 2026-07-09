/** break-glass.ts — emergency elevated access with full audit + auto-expiry. */
import { randomBytes } from 'node:crypto';
import { ApiError } from '../../../lib/errors.js';
import { appendAudit, Tx } from '../../../lib/audit.js';
import { db } from '../../../db/client.js';
import { forward } from '../../siem-forwarder.js';

export interface BreakGlass {
  id: string;
  reason: string;
  scopes: string[];
  grantedAt: number;
  expiresAt: number;
  usedBy?: string;
}

const sessions = new Map<string, BreakGlass>();
const TTL_MS = 60 * 60 * 1000; // 1h

export function activate(reason: string, scopes: string[], actor: string): BreakGlass {
  if (!reason || reason.trim().length < 5)
    throw new ApiError('BREAKGLASS_NO_REASON', 'Break-glass requires a recorded reason.');
  const id = 'BG-' + randomBytes(6).toString('hex');
  const bg: BreakGlass = {
    id,
    reason,
    scopes,
    grantedAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
  };
  sessions.set(id, bg);
  void appendAudit('breakglass.activated', { id, reason, scopes }, actor, db as unknown as Tx);
  void forward({
    ts: Date.now(),
    kind: 'breakglass.activated',
    severity: 'critical',
    attrs: { id, reason },
  });
  return bg;
}

export function isActive(id: string, now: number = Date.now()): boolean {
  const bg = sessions.get(id);
  if (!bg) return false;
  if (now > bg.expiresAt) {
    sessions.delete(id);
    return false;
  }
  return true;
}

export function consume(id: string, actor: string): BreakGlass {
  const bg = sessions.get(id);
  if (!bg || !isActive(id))
    throw new ApiError('BREAKGLASS_EXPIRED', 'Break-glass session invalid/expired.');
  bg.usedBy = actor;
  void appendAudit('breakglass.used', { id }, actor, db as unknown as Tx);
  return bg;
}

export function purgeExpired(now: number = Date.now()): number {
  let n = 0;
  for (const [id, bg] of sessions)
    if (now > bg.expiresAt) {
      sessions.delete(id);
      n++;
    }
  return n;
}
