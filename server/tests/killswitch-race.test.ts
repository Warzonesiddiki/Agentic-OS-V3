import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, systemMeta } from '../src/db/client.js';
import {
  assertOperational,
  assertKillSwitchConsistent,
  isKillSwitchOn,
} from '../src/services/safety.service.js';
import { setKillSwitch } from '../src/services/session.service.js';

async function seedKillSwitch(initial: boolean) {
  await db
    .insert(systemMeta)
    .values({ key: 'killSwitch', value: initial ? '1' : '0', updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemMeta.key,
      set: { value: initial ? '1' : '0', updatedAt: new Date() },
    });
}

describe('Phase 1.7 — kill-switch race hardening', () => {
  beforeAll(async () => {
    await seedKillSwitch(false);
  });

  afterAll(async () => {
    await seedKillSwitch(false);
  });

  it('assertOperational passes while off and throws while on', async () => {
    await seedKillSwitch(false);
    await expect(assertOperational()).resolves.toBeUndefined();
    await seedKillSwitch(true);
    await expect(assertOperational()).rejects.toThrow(/Kill switch is engaged/);
  });

  it('double assert after kill-switch: re-read matches written state (engaged)', async () => {
    await seedKillSwitch(false);
    await setKillSwitch(true, 'race-test', 'sentinel');
    expect(await isKillSwitchOn()).toBe(true);
    // Inside a transaction the post-write guard must agree with the persisted value.
    await db.transaction(async (tx: any) => {
      await expect(assertKillSwitchConsistent(tx, true)).resolves.toBeUndefined();
      await expect(assertKillSwitchConsistent(tx, false)).rejects.toThrow(/diverged/);
    });
  });

  it('double assert after kill-switch: re-read matches written state (released)', async () => {
    await seedKillSwitch(true);
    await setKillSwitch(false, 'race-test-release', 'sentinel');
    expect(await isKillSwitchOn()).toBe(false);
    await db.transaction(async (tx: any) => {
      await expect(assertKillSwitchConsistent(tx, false)).resolves.toBeUndefined();
      await expect(assertKillSwitchConsistent(tx, true)).rejects.toThrow(/diverged/);
    });
  });

  it('setKillSwitch fully releases and is guarded by operational check', async () => {
    await seedKillSwitch(true);
    await setKillSwitch(false, undefined, 'sentinel');
    await expect(assertOperational()).resolves.toBeUndefined();
  });
});
