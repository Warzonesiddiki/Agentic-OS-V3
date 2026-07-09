/**
 * memory-multimodal.ts — Phase 12.14
 * Multi-modal attachment store.
 *
 * Attachments (images / audio / files) are stored against a memory
 * row and optionally carry their own embedding so they participate in
 * cross-modal recall. DB-backed + pure helpers for hashing/sizing.
 */
import { db } from '../db/client.js';
import { memoryAttachments, memories } from '../db/client.js';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { embedQuery } from './embeddings.js';
import { log } from '../lib/logging.js';
import { env } from '../lib/env.js';
type MemoryRow = typeof memories.$inferSelect;

export type AttachmentKind = 'image' | 'audio' | 'video' | 'file' | 'text';

export interface Attachment {
  id: string;
  memoryId: string;
  kind: AttachmentKind;
  uri: string;
  embedding?: number[] | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface StoreAttachmentInput {
  memoryId: string;
  kind: AttachmentKind;
  uri: string;
  embedding?: number[];
  meta?: Record<string, unknown>;
}

/** Store an attachment. Returns the persisted row. */
export async function storeAttachment(input: StoreAttachmentInput): Promise<Attachment> {
  const id = randomUUID();
  await db.insert(memoryAttachments).values({
    id,
    memoryId: input.memoryId,
    kind: input.kind,
    uri: input.uri,
    embedding: input.embedding
      ? (input.embedding as unknown as unknown as Record<string, never>)
      : null,
    meta: (input.meta ?? {}) as unknown as Record<string, never>,
    createdAt: new Date(),
  });
  const [row] = await db
    .select()
    .from(memoryAttachments)
    .where(eq(memoryAttachments.id, id))
    .limit(1);
  return row as unknown as Attachment;
}

/** List attachments for a memory. */
export async function listAttachments(memoryId: string): Promise<Attachment[]> {
  const rows = await db
    .select()
    .from(memoryAttachments)
    .where(eq(memoryAttachments.memoryId, memoryId));
  return rows as unknown as Attachment[];
}

/** Cosine nearest attachments across a project (cross-modal recall). */
export async function nearestAttachments(
  projectId: string,
  vector: number[],
  limit = 5
): Promise<Attachment[]> {
  const memRows = await db
    .select({ id: memories.id })
    .from(memories)
    .where(and(eq(memories.projectId, projectId), isNull(memories.deletedAt)));
  const ids = memRows.map((m: { id: string }) => m.id);
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(memoryAttachments)
    .where(eq(memoryAttachments.memoryId, ids[0]));
  // simple in-memory cosine over the returned set (bounded by memory count)
  return (rows as unknown as Attachment[])
    .filter((a) => !!a.embedding)
    .map((a) => ({ a, sim: cosine(a.embedding!, vector) }))
    .sort((x, y) => y.sim - x.sim)
    .slice(0, limit)
    .map((x) => x.a);
}

/** Stable content hash for dedup of attachments. */
export function attachmentHash(kind: string, uri: string, meta: Record<string, unknown>): string {
  const str = JSON.stringify({ kind, uri, meta });
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) * (a[i] ?? 0);
    nb += (b[i] ?? 0) * (b[i] ?? 0);
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/* ─── Caption quality scoring (target #3: down-weight low-quality captions in recall) ─── */
export const CAPTION_QUALITY_THRESHOLD = 0.5;

const BOILERPLATE = [
  'no caption',
  'untitled',
  'image',
  'photo',
  'picture',
  'this is a',
  'this image',
  'the image shows',
  'the photo shows',
  'a picture of',
  'n/a',
  'null',
];

export function scoreCaptionQuality(caption: string, lang?: string): number {
  const c = (caption ?? '').trim();
  if (c.length === 0) return 0;
  const lower = c.toLowerCase();
  if (BOILERPLATE.includes(lower)) return 0.05;
  const words = c.split(/\s+/).filter((w) => w.length > 1);
  const n = words.length;
  if (n < 2) return 0.1;
  const uniq = new Set(words.map((w) => w.toLowerCase())).size;
  const density = uniq / n;
  let lengthScore = 1;
  if (n < 3) lengthScore = 0.3;
  else if (n > 40) lengthScore = Math.max(0.6, 1 - (n - 40) / 200);
  const langPenalty = lang && lang !== 'und' && lang !== 'unknown' ? 1 : 0.6;
  let boiler = 1;
  for (const b of BOILERPLATE) {
    if (lower.includes(b) && b.length > 3) {
      boiler = 0.4;
      break;
    }
  }
  const score = density * 0.4 + lengthScore * 0.4 + boiler * 0.2;
  return Math.max(0, Math.min(1, score * langPenalty));
}

export function isLowQualityCaption(caption: string, lang?: string): boolean {
  return scoreCaptionQuality(caption, lang) < CAPTION_QUALITY_THRESHOLD;
}

/** Down-weight a memory's importance when its caption is low-quality so it ranks lower in recall. */
function captionQualityImportance(
  caption: string | undefined,
  base: number | undefined,
  lang?: string
): number {
  const baseImp = base ?? 0.5;
  if (!caption) return baseImp;
  const q = scoreCaptionQuality(caption, lang);
  if (q >= CAPTION_QUALITY_THRESHOLD) return baseImp;
  // Scale importance by the quality score (bad captions contribute little to retrieval).
  return Math.max(0.05, baseImp * (0.4 + 0.6 * q));
}

export type MultimodalKind = 'image' | 'audio' | 'video' | 'document' | 'text';
export type LanguageCode =
  | 'en'
  | 'es'
  | 'fr'
  | 'de'
  | 'it'
  | 'pt'
  | 'nl'
  | 'ru'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'ar'
  | 'hi'
  | 'und'
  | 'unknown';

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'is',
  'are',
  'was',
]);

/**
 * Lightweight language detection (pure, no provider). Uses a small frequency
 * table of common stopwords per language; falls back to 'und' when ambiguous.
 */
export function detectLanguage(text: string): LanguageCode {
  const tokens = text
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  const samples: Array<[LanguageCode, string[]]> = [
    ['es', ['el', 'la', 'los', 'una', 'que', 'por', 'con', 'para']],
    ['fr', ['le', 'la', 'les', 'une', 'que', 'pour', 'avec', 'est']],
    ['de', ['der', 'die', 'das', 'und', 'ist', 'ein', 'mit', 'für']],
    ['it', ['il', 'la', 'i', 'che', 'per', 'con', 'una', 'è']],
    ['pt', ['o', 'a', 'os', 'que', 'para', 'com', 'uma', 'é']],
    ['nl', ['de', 'het', 'een', 'en', 'van', 'is', 'met', 'voor']],
    ['ru', ['и', 'в', 'на', 'с', 'что', 'это', 'по', 'для']],
    ['zh', ['的', '了', '是', '我', '有', '在', '他', '这']],
    ['ja', ['の', 'に', 'は', 'を', 'が', 'で', 'た', 'と']],
    ['ko', ['의', '에', '는', '를', '이', '가', '다', '로']],
    ['ar', ['في', 'من', 'على', 'أن', 'هو', 'مع', 'هذه', 'أن']],
    ['hi', ['है', 'का', 'की', 'में', 'को', 'एक', 'और', 'यह']],
  ];
  const counts = new Map<LanguageCode, number>();
  for (const [lang, words] of samples) {
    let c = 0;
    for (const t of tokens) if (words.includes(t)) c++;
    if (c > 0) counts.set(lang, c);
  }
  let best: LanguageCode = 'und';
  let bestC = 0;
  for (const [lang, c] of counts) {
    if (c > bestC) {
      best = lang;
      bestC = c;
    }
  }
  return best;
}

const LIBRE_TRANSLATE_ENDPOINT = process.env.NEXUS_TRANSLATE_ENDPOINT ?? '';

/**
 * Translate a memory's text + caption into `targetLang` via LibreTranslate.
 * Returns the translated text; falls back to the original when no endpoint is
 * configured or the call fails (never throws).
 */
export async function translateMemory(
  id: string,
  targetLang: LanguageCode
): Promise<{ id: string; text: string; caption: string; lang: LanguageCode } | null> {
  const row = await db.select().from(memories).where(eq(memories.id, id)).limit(1);
  const mem = (row as unknown as Array<{ content: string; caption?: string | null }>)[0];
  if (!mem) return null;
  if (!LIBRE_TRANSLATE_ENDPOINT) {
    return { id, text: mem.content, caption: mem.caption ?? '', lang: targetLang };
  }
  try {
    const res = await fetch(`${LIBRE_TRANSLATE_ENDPOINT}/translate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        q: `${mem.content}\n${mem.caption ?? ''}`,
        source: 'auto',
        target: targetLang,
        format: 'text',
      }),
    });
    if (!res.ok) throw new Error(`translate ${res.status}`);
    const data = (await res.json()) as { translatedText?: string };
    const translated = data.translatedText ?? mem.content;
    const [text, caption] = translated.split('\n');
    return { id, text: text ?? translated, caption: caption ?? '', lang: targetLang };
  } catch (e) {
    log.warn('translate_memory_failed', { id, error: e instanceof Error ? e.message : String(e) });
    return { id, text: mem.content, caption: mem.caption ?? '', lang: targetLang };
  }
}

export interface AddMultimodalMemoryInput {
  projectId?: string;
  agentId?: string;
  kind: MultimodalKind;
  blobRef: string;
  mimeType?: string;
  text?: string;
  caption?: string;
  importance?: number;
  meta?: Record<string, unknown>;
  lang?: LanguageCode;
}

/**
 * Add a multimodal memory. The caption is quality-scored; low-quality captions
 * are down-weighted in `importance` so they rank lower during recall (target #3).
 */
export async function addMultimodalMemory(input: AddMultimodalMemoryInput): Promise<MemoryRow> {
  const content = `[${input.kind}] ${[input.caption, input.text].filter(Boolean).join(' ')}`.slice(
    0,
    4000
  );
  const embedding = await embedQuery(content);
  const lang = input.lang ?? detectLanguage(content);
  const [row] = await db
    .insert(memories)
    .values({
      projectId: input.projectId ?? null,
      agentId: input.agentId ?? null,
      kind: input.kind,
      title: input.caption ?? input.kind,
      content,
      embedding: embedding ? (embedding as unknown as unknown as Record<string, never>) : null,
      importance: captionQualityImportance(input.caption, input.importance, input.lang),
      language: lang,
      tags: (input.meta && Object.keys(input.meta).length
        ? [JSON.stringify(input.meta)]
        : []) as string[],
      createdAt: new Date(),
    })
    .returning();
  return row as unknown as MemoryRow;
}

export async function updateMultimodalMemory(
  id: string,
  patch: Partial<
    Pick<AddMultimodalMemoryInput, 'text' | 'caption' | 'importance' | 'meta' | 'lang'>
  >
): Promise<MemoryRow> {
  const current = await db.select().from(memories).where(eq(memories.id, id)).limit(1);
  const cur = (current as unknown as MemoryRow[])[0];
  if (!cur) throw new Error('memory_not_found');
  const caption = patch.caption ?? cur.title ?? undefined;
  const text = patch.text ?? cur.content;
  const importance = captionQualityImportance(
    caption,
    patch.importance ?? cur.importance,
    patch.lang ?? cur.language ?? undefined
  );
  const [row] = await db
    .update(memories)
    .set({
      title: caption ?? cur.title,
      content: text,
      importance,
      language: patch.lang ?? cur.language,
      tags: (patch.meta && Object.keys(patch.meta).length
        ? [JSON.stringify(patch.meta)]
        : cur.tags) as string[],
      updatedAt: new Date(),
    })
    .where(eq(memories.id, id))
    .returning();
  return row as unknown as MemoryRow;
}

export async function getMultimodalMemory(id: string): Promise<MemoryRow | null> {
  const [row] = await db.select().from(memories).where(eq(memories.id, id)).limit(1);
  return (row as unknown as MemoryRow) ?? null;
}

/**
 * Optional VLM caption generation. Returns null when no VLM endpoint is
 * configured or the call fails (never throws — captioning is best-effort).
 */
export async function generateImageCaption(blobRef: string): Promise<string | null> {
  const endpoint = process.env.NEXUS_VLM_ENDPOINT;
  if (!endpoint) return null;
  try {
    const res = await fetch(`${endpoint}/caption`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: blobRef }),
    });
    if (!res.ok) throw new Error(`vlm ${res.status}`);
    const data = (await res.json()) as { caption?: string };
    return data.caption ?? null;
  } catch (e) {
    log.warn('generate_image_caption_failed', {
      blobRef,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
