/**
 * brain.ts — brain export/import/compress. Import is Zod-schema-validated
 * (cannot inject invalid records) and idempotent via dedup; export NEVER
 * includes API keys or hashes.
 */
import { z } from "zod";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { memories, skills } from "../db/client.js";
import { appendAudit, type Tx } from "../lib/audit.js";
import { estimateTokens } from "../lib/tokens.js";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { ApiError } from "../lib/errors.js";

const memoryImport = z.object({
  kind: z.enum(["episodic", "semantic", "preference", "reflexion", "fact"]),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  importance: z.number().min(0).max(1).default(0.5),
  source: z.string().max(120).default("import"),
});

const skillImport = z.object({
  name: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(400),
  content: z.string().min(1),
  category: z.string().default("general"),
  tags: z.array(z.string()).default([]),
});

const brainSchema = z.object({
  format: z.literal("nexus-brain"),
  version: z.number(),
  memories: z.array(memoryImport).default([]),
  skills: z.array(skillImport).default([]),
});

function dedupeKey(title: string, content: string): string {
  return createHash("sha256").update(`${title.trim().toLowerCase()}|${content.trim().toLowerCase().slice(0, 160)}`).digest("hex");
}

export async function exportBrain(): Promise<unknown> {
  const [mem, skl] = await Promise.all([db.query.memories.findMany(), db.query.skills.findMany()]);
  return { format: "nexus-brain", version: 2, exportedAt: Date.now(), memories: mem, skills: skl };
}

export async function importBrain(raw: unknown, actor: string): Promise<{ memories: number; skills: number; duplicates: number }> {
  const parsed = brainSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", `Invalid brain payload: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`);
  }
  const data = parsed.data;
  const existingMems = await db.query.memories.findMany();
  const existingSkills = await db.query.skills.findMany();
  // All inserts commit atomically; a failure mid-import rolls back fully.
  const { memCreated, sklCreated, duplicates } = await db.transaction(async (tx: Tx) => {
    const seen = new Set(existingMems.map((m: typeof existingMems[number]) => dedupeKey(m.title, m.content)));
    let mc = 0;
    let dup = 0;
    for (const m of data.memories) {
      const k = dedupeKey(m.title, m.content);
      if (seen.has(k)) { dup++; continue; }
      seen.add(k);
      await tx.insert(memories).values({
        id: `mem_${randomUUID()}`,
        kind: m.kind, title: m.title, content: m.content, tags: m.tags, importance: m.importance,
        source: m.source, tokenCost: estimateTokens(m.content), recallCount: 0,
      });
      mc++;
    }
    const skillSeen = new Set(existingSkills.map((s: typeof existingSkills[number]) => s.name));
    let sc = 0;
    for (const s of data.skills) {
      if (skillSeen.has(s.name)) { dup++; continue; }
      skillSeen.add(s.name);
      await tx.insert(skills).values({
        id: `skl_${randomUUID()}`,
        name: s.name, title: s.title, description: s.description, content: s.content,
        category: s.category, tags: s.tags, source: "import",
      });
      sc++;
    }
    return { memCreated: mc, sklCreated: sc, duplicates: dup };
  });

  await appendAudit("brain.imported", { memories: memCreated, skills: sklCreated, duplicates }, actor);
  return { memories: memCreated, skills: sklCreated, duplicates };
}

export async function compressBrain(actor: string): Promise<{ pruned: number; kept: number }> {
  // Prune low-importance, never-recalled, episodic memories older than 7 days.
  // Uses a single bulk DELETE + count in a transaction (not N+1 loop).
  const countCol = sql<number>`count(*)::int`;
  const [beforeRow] = await db.select({ total: countCol }).from(memories);

  return db.transaction(async (tx: Tx) => {
    const deleted = await tx.delete(memories).where(
      and(
        eq(memories.kind, "episodic"),
        lt(memories.importance, 0.2),
        eq(memories.recallCount, 0),
        lt(memories.updatedAt, new Date(Date.now() - 7 * 86_400_000)),
      )
    ).returning({ id: memories.id });

    const [afterRow] = await tx.select({ total: countCol }).from(memories);
    await appendAudit("brain.compressed", {
      pruned: deleted.length,
      before: beforeRow?.total ?? 0,
      after: afterRow?.total ?? 0,
    }, actor, tx);

    return { pruned: deleted.length, kept: afterRow?.total ?? 0 };
  });
}
