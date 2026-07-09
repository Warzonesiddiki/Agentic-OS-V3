import { describe, it, expect, vi, beforeEach } from 'vitest';

const { store } = vi.hoisted(() => ({ store: { selectResult: [] as any[], calls: [] as any[], backend: 'sqlite' } }));
vi.mock('../src/db/client.js', () => buildClientMock(store));
vi.mock('../src/services/safety.service.js', () => ({ assertOperational: vi.fn(async () => {}) }));

import { buildClientMock } from '../tests/helpers/db-chain.js';
import {
  storeAttachment,
  getAttachments,
  deleteAttachment,
  generateImageThumbnail,
  highlightCode,
} from '../src/services/memory-attachments.js';

describe('memory-attachments / storeAttachment', () => {
  beforeEach(() => {
    store.calls.length = 0;
    store.selectResult = [{ id: 'm1' }]; // memory exists
  });

  it('throws when the parent memory is missing', async () => {
    store.selectResult = []; // not found
    await expect(
      storeAttachment('mX', 'file', { fileName: 'a.txt', content: 'data' })
    ).rejects.toThrow(/not found/i);
  });

  it('stores an image attachment with a generated thumbnail', async () => {
    const att = await storeAttachment('m1', 'image', {
      fileName: 'pic.png',
      content: 'base64img',
      mimeType: 'image/png',
    });
    expect(att.id.startsWith('att_')).toBe(true);
    expect(att.kind).toBe('image');
    expect(att.thumbnail).toBeTruthy();
    expect(att.thumbnail!.startsWith('data:image/svg+xml')).toBe(true);
    expect(att.language).toBeNull();
  });

  it('stores a code attachment with highlighted content and language', async () => {
    const att = await storeAttachment('m1', 'code', {
      fileName: 'x.ts',
      content: 'const a = 1;',
      language: 'typescript',
    });
    expect(att.language).toBe('typescript');
    expect(att.highlighted).toContain('<span class="kw">const</span>');
  });

  it('computes sizeBytes from content', async () => {
    const att = await storeAttachment('m1', 'file', { fileName: 'a.txt', content: 'abcdef' });
    expect(att.sizeBytes).toBe(6);
  });
});

describe('memory-attachments / getAttachments & deleteAttachment', () => {
  beforeEach(() => {
    store.calls.length = 0;
  });

  it('returns the rows from the attachment table', async () => {
    store.selectResult = [{ id: 'att_1', memoryId: 'm1', kind: 'file' }];
    const rows = await getAttachments('m1');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('att_1');
  });

  it('deleteAttachment issues a delete against the attachment table', async () => {
    await deleteAttachment('att_1');
    const dels = store.calls.filter((c) => c.op === 'delete');
    expect(dels.length).toBeGreaterThan(0);
  });
});

describe('memory-attachments / pure helpers (regression)', () => {
  it('generateImageThumbnail strips unsafe label chars', () => {
    const uri = generateImageThumbnail({ label: 'a <b> "c" & d' });
    const svg = decodeURIComponent(uri.replace('data:image/svg+xml;utf8,', ''));
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('a b  c  d'); // < > & " removed
  });

  it('highlightCode produces well-formed spans (no mangled class attr)', () => {
    const html = highlightCode('const s = "hi";');
    expect(html).toContain('<span class="kw">const</span>');
    expect(html).toContain('<span class="str">"hi"</span>');
    // The bug we fixed: keyword pass must not corrupt the generated span markup.
    expect(html).not.toContain('<span <span');
  });
});
