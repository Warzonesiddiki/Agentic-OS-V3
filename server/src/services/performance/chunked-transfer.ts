/**
 * chunked-transfer.ts — Phase 15.9 adaptive chunked transfer.
 *
 * Splits a payload into chunks whose size adapts to (a) payload size, (b) declared content-type,
 * and (c) an optional client capability hint (e.g. "low-bandwidth"). Returns chunk descriptors so
 * the transport layer can stream them with correct framing without buffering the whole payload.
 */
import { log } from '../../lib/logging.js';

export type ContentKind = 'json' | 'text' | 'binary' | 'stream';

export interface ChunkDescriptor {
  index: number;
  offset: number;
  length: number;
  total: number;
  isLast: boolean;
}

export interface ChunkPlan {
  total: number;
  chunkSize: number;
  chunkCount: number;
  descriptors: ChunkDescriptor[];
  reason: string;
}

const BASE_CHUNK = 64 * 1024; // 64 KiB
const MAX_CHUNK = 1024 * 1024; // 1 MiB
const MIN_CHUNK = 8 * 1024; // 8 KiB

export function contentKindFromType(contentType: string | undefined): ContentKind {
  if (!contentType) return 'binary';
  const ct = contentType.toLowerCase();
  if (ct.includes('application/json') || ct.includes('application/x-ndjson')) return 'json';
  if (ct.startsWith('text/')) return 'text';
  // Generic binary payload (the most common "binary" type) maps to 'binary', not 'stream'.
  if (ct.includes('octet-stream')) return 'binary';
  // Genuine streaming content types (e.g. text/event-stream, application/stream+json) are 'stream'.
  if (ct.includes('stream')) return 'stream';
  return 'binary';
}

/**
 * Decide an adaptive chunk size.
 * - Binary/stream payloads are chunked coarser (less framing overhead).
 * - JSON/text are chunked finer for earlier first-byte.
 * - A "low-bandwidth" client hint shrinks the chunk.
 */
export function adaptiveChunkSize(
  totalBytes: number,
  kind: ContentKind,
  opts?: { lowBandwidth?: boolean; explicitChunkSize?: number }
): number {
  if (opts?.explicitChunkSize && opts.explicitChunkSize > 0) return opts.explicitChunkSize;
  let size = BASE_CHUNK;
  if (kind === 'binary' || kind === 'stream') size = BASE_CHUNK * 2;
  if (kind === 'json' || kind === 'text') size = BASE_CHUNK;
  if (opts?.lowBandwidth) size = Math.max(MIN_CHUNK, Math.floor(size / 4));
  // Very large payloads: grow chunk toward MAX to bound chunk count.
  if (totalBytes > 16 * 1024 * 1024) size = Math.min(MAX_CHUNK, size * 2);
  return Math.min(MAX_CHUNK, Math.max(MIN_CHUNK, size));
}

export function planChunks(
  totalBytes: number,
  contentType?: string,
  opts?: { lowBandwidth?: boolean; explicitChunkSize?: number }
): ChunkPlan {
  if (totalBytes <= 0) {
    return { total: 0, chunkSize: 0, chunkCount: 0, descriptors: [], reason: 'empty' };
  }
  const kind = contentKindFromType(contentType);
  const chunkSize = adaptiveChunkSize(totalBytes, kind, opts);
  const chunkCount = Math.ceil(totalBytes / chunkSize);
  const descriptors: ChunkDescriptor[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const offset = i * chunkSize;
    const length = Math.min(chunkSize, totalBytes - offset);
    descriptors.push({
      index: i,
      offset,
      length,
      total: totalBytes,
      isLast: i === chunkCount - 1,
    });
  }
  log.debug('chunked-transfer: planned', { totalBytes, kind, chunkSize, chunkCount });
  return { total: totalBytes, chunkSize, chunkCount, descriptors, reason: `kind=${kind}` };
}

/** Iterator that yields chunk descriptors for a Buffer. */
export function* chunkBuffer(
  buf: Buffer,
  contentType?: string,
  opts?: { lowBandwidth?: boolean }
): Generator<ChunkDescriptor> {
  const plan = planChunks(buf.length, contentType, opts);
  for (const d of plan.descriptors) yield d;
}
