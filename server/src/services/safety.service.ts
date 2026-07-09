import { eq } from 'drizzle-orm';
import { db, systemMeta, DbTx } from '../db/client.js';
import { ApiError } from '../lib/errors.js';
import { getEnv } from '../lib/env.js';

export async function isKillSwitchOn(tx?: DbTx): Promise<boolean> {
  const client = tx || db;
  let query = client.select().from(systemMeta).where(eq(systemMeta.key, 'killSwitch'));
  if (tx) {
    const isSqlite = !(getEnv().DATABASE_URL || '').startsWith('postgres');
    if (!isSqlite) {
      query = query.for('update');
    }
  }
  const [row] = await query.limit(1);
  return row?.value === '1';
}

export async function assertOperational(tx?: DbTx): Promise<void> {
  if (await isKillSwitchOn(tx))
    throw new ApiError('SAFETY_KILL_SWITCH', 'Kill switch is engaged — mutations are blocked.');
}

/**
 * Second assert in the "double assertOperational after kill-switch" guard.
 *
 * After the kill-switch row has been (re)written inside a locked transaction, the row is
 * re-read and re-checked against the state the mutating operation intended to persist. This
 * closes the TOCTOU race where a concurrent kill-switch write could be interleaved between
 * the pre-write guard and our own write/commit, leaving the system in a divergent state.
 *
 * Throws SAFETY_KILL_SWITCH_INCONSISTENT if the persisted state diverges from `expected`,
 * forcing the surrounding transaction to roll back.
 */
export async function assertKillSwitchConsistent(tx: DbTx, expected: boolean): Promise<void> {
  const isSqlite = !(getEnv().DATABASE_URL || '').startsWith('postgres');
  let query = tx.select().from(systemMeta).where(eq(systemMeta.key, 'killSwitch'));
  if (!isSqlite) {
    // Re-lock defensively even though the earlier guard already held the row.
    query = query.for('update');
  }
  const [row] = await query.limit(1);
  const on = row?.value === '1';
  if (on !== expected) {
    throw new ApiError(
      'SAFETY_KILL_SWITCH_INCONSISTENT',
      `Kill switch state diverged after write (expected ${expected ? 'engaged' : 'released'}, saw ${on ? 'engaged' : 'released'}). Rolling back.`
    );
  }
}
