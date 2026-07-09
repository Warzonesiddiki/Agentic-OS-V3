import { db } from '../db/client.js';
import { systemMeta } from '../db/client.js';
import { appendAudit, type Tx } from '../lib/audit.js';
import { assertOperational, assertKillSwitchConsistent } from './safety.service.js';

export async function setKillSwitch(
  enabled: boolean,
  reason: string | undefined,
  actor: string
): Promise<void> {
  // First assert: pre-flight check before acquiring the lock.
  await assertOperational();
  await db.transaction(async (tx: Tx) => {
    // Second assert: inside the locked transaction, before we write.
    await assertOperational(tx);
    const value = enabled ? '1' : '0';
    await tx
      .insert(systemMeta)
      .values({ key: 'killSwitch', value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: systemMeta.key, set: { value, updatedAt: new Date() } });
    if (reason != null) {
      await tx
        .insert(systemMeta)
        .values({ key: 'killSwitchReason', value: reason, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemMeta.key,
          set: { value: reason, updatedAt: new Date() },
        });
    }
    await appendAudit(
      enabled ? 'safety.kill_switch.engaged' : 'safety.kill_switch.released',
      { reason: reason ?? null },
      actor,
      tx
    );
    // Third assert ("double assertOperational after kill-switch"): re-read the row inside
    // the same lock to guarantee the persisted state matches what we just wrote. Closes the
    // TOCTOU race where a concurrent kill-switch write could interleave with ours.
    await assertKillSwitchConsistent(tx, enabled);
  });
}
