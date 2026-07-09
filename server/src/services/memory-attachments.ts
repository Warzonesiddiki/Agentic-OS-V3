/**
 * memory-attachments.ts — store/retrieve memory attachments (Phase 12).
 *
 * Attachments live on the `memory_attachments` table. For image attachments a
 * lightweight SVG thumbnail is generated; for code attachments an HTML syntax
 * highlighter is applied. All DB access goes through the shared `db` singleton.
 */
import { db } from '../db/client.js';
import { memoryAttachments, memories } from '../db/client.js';
import { ApiError } from '../lib/errors.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export type AttachmentKind = 'image' | 'code' | 'audio' | 'file';

export interface StoreAttachmentInput {
  fileName: string;
  mimeType?: string;
  content: string;
  language?: string;
  thumbnail?: string;
  highlighted?: string;
}

export interface MemoryAttachment {
  id: string;
  memoryId: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  content: string;
  thumbnail: string | null;
  highlighted: string | null;
  language: string | null;
  createdAt: string;
}

export async function storeAttachment(
  memoryId: string,
  kind: AttachmentKind,
  data: StoreAttachmentInput
): Promise<MemoryAttachment> {
  const found = await db
    .select({ id: memories.id })
    .from(memories)
    .where(eq(memories.id, memoryId))
    .limit(1);
  if (found.length === 0) {
    throw new ApiError('NOT_FOUND', `Memory ${memoryId} not found.`);
  }

  const sizeBytes = Buffer.byteLength(data.content);
  const thumbnail: string | null =
    kind === 'image' ? (data.thumbnail ?? generateImageThumbnail({ label: data.fileName })) : null;
  const highlighted: string | null =
    kind === 'code' ? highlightCode(data.content, data.language) : null;
  const language: string | null = data.language ?? null;
  const mimeType = data.mimeType ?? 'application/octet-stream';

  const [row] = await db
    .insert(memoryAttachments)
    .values({
      id: `att_${randomUUID()}`,
      memoryId,
      kind,
      fileName: data.fileName,
      mimeType,
      sizeBytes,
      content: data.content,
      thumbnail,
      highlighted,
      language,
    })
    .returning();

  return row as MemoryAttachment;
}

export async function getAttachments(memoryId: string): Promise<MemoryAttachment[]> {
  const rows = await db
    .select()
    .from(memoryAttachments)
    .where(eq(memoryAttachments.memoryId, memoryId));
  return rows as MemoryAttachment[];
}

export async function deleteAttachment(id: string): Promise<void> {
  await db.delete(memoryAttachments).where(eq(memoryAttachments.id, id));
}

/** Build a minimal, valid, dependency-free SVG data URI. */
export function generateImageThumbnail(input: {
  width?: number;
  height?: number;
  label?: string;
}): string {
  const width = input.width ?? 200;
  const height = input.height ?? 120;
  const label = input.label ?? 'attachment';
  const safeLabel = label.replace(/[<>&"]/g, '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="#2a2a3a"/>` +
    `<text x="50%" y="50%" fill="#cfcfe6" font-family="sans-serif" font-size="14" text-anchor="middle" dominant-baseline="middle">${safeLabel}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const KEYWORDS = [
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'class',
  'import',
  'export',
  'async',
  'await',
  'new',
  'throw',
  'try',
  'catch',
  'from',
  'def',
  'public',
  'private',
];

/** Escape HTML and wrap keywords / string literals in highlight spans. */
export function highlightCode(code: string, language?: string): string {
  const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Use a private-use placeholder so keyword/string spans never overlap or
  // corrupt each other's generated markup (the previous version let the keyword
  // pass match the word "class" inside the <span class="str"> it had just
  // created, producing malformed HTML).
  const PLACEHOLDER = '';
  const store: string[] = [];
  const stash = (html: string) => {
    store.push(html);
    return `${PLACEHOLDER}${store.length - 1}${PLACEHOLDER}`;
  };

  // Strings first: stash each literal so the keyword pass won't touch the
  // `class="..."` attribute text inside generated spans.
  const withStrings = escaped.replace(
    /(&quot;|&#39;|"|')(?:\\.|[^"'])*\1/g,
    (m) => stash(`<span class="str">${m}</span>`)
  );

  const kwPattern = new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'g');
  const withKeywords = withStrings.replace(kwPattern, (m) => stash(`<span class="kw">${m}</span>`));

  const restored = withKeywords.replace(
    new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g'),
    (_m, i) => store[Number(i)] ?? ''
  );

  return `<pre class="codehilite" data-lang="${language ?? 'text'}"><code>${restored}</code></pre>`;
}
