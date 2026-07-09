import { randomUUID } from 'node:crypto';
import { db, memories } from '../db/client.js';
import { embedQuery } from '../services/embeddings.js';

interface LangProfile {
  code: string;
  ranges?: Array<[number, number]>;
  stopwords?: string[];
}

const SCRIPT_PROFILES: LangProfile[] = [
  { code: 'zh', ranges: [[0x4e00, 0x9fff]] },
  {
    code: 'ja',
    ranges: [
      [0x3040, 0x30ff],
      [0x4e00, 0x9fff],
    ],
  },
  {
    code: 'ko',
    ranges: [
      [0xac00, 0xd7af],
      [0x1100, 0x11ff],
    ],
  },
  { code: 'ru', ranges: [[0x0400, 0x04ff]] },
  { code: 'ar', ranges: [[0x0600, 0x06ff]] },
  { code: 'hi', ranges: [[0x0900, 0x097f]] },
];

const LATIN_PROFILES: LangProfile[] = [
  {
    code: 'en',
    stopwords: [
      'the',
      'is',
      'are',
      'and',
      'of',
      'to',
      'in',
      'that',
      'this',
      'it',
      'for',
      'with',
      'on',
      'as',
      'was',
      'but',
    ],
  },
  {
    code: 'es',
    stopwords: [
      'el',
      'la',
      'los',
      'las',
      'es',
      'son',
      'y',
      'de',
      'que',
      'en',
      'un',
      'una',
      'por',
      'con',
      'para',
      'se',
    ],
  },
  {
    code: 'fr',
    stopwords: [
      'le',
      'la',
      'les',
      'est',
      'sont',
      'et',
      'de',
      'que',
      'en',
      'un',
      'une',
      'pour',
      'avec',
      'ce',
      'pas',
    ],
  },
  {
    code: 'de',
    stopwords: [
      'der',
      'die',
      'das',
      'ist',
      'sind',
      'und',
      'ein',
      'eine',
      'zu',
      'den',
      'das',
      'mit',
      'auf',
      'nicht',
      'im',
    ],
  },
  {
    code: 'it',
    stopwords: [
      'il',
      'la',
      'i',
      'le',
      'e',
      'di',
      'que',
      'un',
      'una',
      'per',
      'con',
      'non',
      'si',
      'su',
    ],
  },
  {
    code: 'pt',
    stopwords: [
      'o',
      'a',
      'os',
      'as',
      'e',
      'de',
      'que',
      'um',
      'uma',
      'para',
      'com',
      'nao',
      'se',
      'no',
    ],
  },
  {
    code: 'nl',
    stopwords: [
      'de',
      'het',
      'is',
      'zijn',
      'en',
      'van',
      'dat',
      'in',
      'een',
      'met',
      'voor',
      'op',
      'niet',
      'als',
      'zij',
    ],
  },
];

export function detectLanguage(text: string): string {
  if (!text || text.trim().length === 0) return 'unknown';
  const lower = text.toLowerCase();
  let best: { code: string; score: number } | null = null;
  for (const p of SCRIPT_PROFILES) {
    let count = 0;
    for (const ch of lower) {
      const cp = ch.codePointAt(0) ?? 0;
      if (p.ranges !== undefined && p.ranges.some((range) => cp >= range[0] && cp <= range[1]))
        count++;
    }
    if (count > 0) {
      const score = count / Math.max(1, lower.length);
      if (!best || score > best.score) best = { code: p.code, score };
    }
  }
  if (best && best.score > 0.1) return best.code;
  const tokens = lower.split(/[^a-zà-ÿ]+/).filter((t) => t.length > 1);
  let bestLatin: { code: string; hits: number } | null = null;
  for (const p of LATIN_PROFILES) {
    const sw = p.stopwords ?? [];
    let hits = 0;
    for (const t of tokens) {
      if (sw.includes(t)) hits++;
    }
    if (hits > 0 && (!bestLatin || hits > bestLatin.hits)) bestLatin = { code: p.code, hits };
  }
  if (bestLatin && bestLatin.hits >= 2) return bestLatin.code;
  return 'unknown';
}

export interface MultilingualMemoryInput {
  kind: string;
  title: string;
  content: string;
  tags?: string[];
  importance?: number;
  source?: string;
  projectId?: string | null;
  language?: string;
}

export interface MultilingualMemoryResult {
  id: string;
  language: string;
  embedding: number[] | null;
}

export async function storeMultilingualMemory(
  input: MultilingualMemoryInput
): Promise<MultilingualMemoryResult> {
  const language =
    input.language && input.language.trim().length > 0
      ? input.language
      : detectLanguage(input.content || input.title);
  const embedding = await embedQuery(input.content);
  const id = `mem_${randomUUID()}`;
  await db.insert(memories).values({
    id,
    kind: input.kind,
    title: input.title,
    content: input.content,
    tags: input.tags ?? [],
    importance: input.importance ?? 0.5,
    source: input.source ?? 'manual',
    projectId: input.projectId ?? null,
    language,
    embedding,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id, language, embedding };
}

export async function getLanguageDistribution(): Promise<Record<string, number>> {
  const rows = await db.select({ language: memories.language }).from(memories);
  const dist: Record<string, number> = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const lang = typeof r.language === 'string' && r.language.length > 0 ? r.language : 'unknown';
    dist[lang] = (dist[lang] ?? 0) + 1;
  }
  return dist;
}
