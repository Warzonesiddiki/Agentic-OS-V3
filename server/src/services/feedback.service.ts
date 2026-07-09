import { db } from '../db/client.js';
import { feedback } from '../db/client.js';
import { appendAudit, type Tx } from '../lib/audit.js';
import { randomUUID } from 'node:crypto';
import { assertOperational } from './safety.service.js';

export async function recordFeedback(
  input: { query: string; itemId: string; itemType: string; helpful: boolean },
  actor: string
): Promise<void> {
  await assertOperational();
  await db.transaction(async (tx: Tx) => {
    await assertOperational(tx);
    await tx.insert(feedback).values({
      id: `fb_${randomUUID()}`,
      query: input.query,
      itemId: input.itemId,
      itemType: input.itemType,
      helpful: input.helpful,
    });
    await appendAudit(
      'feedback.recorded',
      { itemId: input.itemId, helpful: input.helpful },
      actor,
      tx
    );
  });
}
