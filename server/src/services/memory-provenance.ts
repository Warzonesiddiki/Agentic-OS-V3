import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import type { Table } from 'drizzle-orm';

export type InfluenceReason = 'priming' | 'provenance' | 'nl-query' | 'recall';

export interface InfluenceInput {
  memoryId: string;
  contextKey: string;
  reason: InfluenceReason;
  tokens: number;
  position: number;
}

export interface StoredInfluence extends InfluenceInput {
  id: string;
  createdAt: string;
}

async function getMemoryInfluenceTable(): Promise<Table> {
  const schema = (await import('../db/schema.js')) as { memoryInfluence?: Table };
  const table = schema.memoryInfluence;
  if (!table) throw new Error('memoryInfluence table is not defined in schema');
  return table;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function recordMemoryInfluence(input: InfluenceInput): Promise<StoredInfluence> {
  const table = await getMemoryInfluenceTable();
  const id = `inf_${randomUUID()}`;
  const createdAt = new Date();
  await db.insert(table).values({
    id,
    memoryId: input.memoryId,
    contextKey: escapeHtml(input.contextKey),
    reason: input.reason,
    tokens: input.tokens,
    position: input.position,
    createdAt,
  } as Record<string, unknown>);
  return { ...input, id, createdAt: createdAt.toISOString() };
}

export async function recordMemoryInfluences(inputs: InfluenceInput[]): Promise<StoredInfluence[]> {
  const out: StoredInfluence[] = [];
  for (const input of inputs) {
    out.push(await recordMemoryInfluence(input));
  }
  return out;
}
