/**
 * SecB — NONSTOP security perfection workstream.
 *
 * file-watcher.ts audit (Batch 3):
 *   Security property: syncWorkspace must NEVER escape the given workspaceDir
 *   (path-traversal containment) and must always record an audit event.
 *
 * DB + audit are mocked; no real database or network. No FROZEN files touched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const appendAudit = vi.fn().mockResolvedValue(undefined);

// Mock the db-backed convention extraction + audit sink.
vi.mock('../src/db/client.js', () => ({
  db: {
    query: {
      memories: {
        findMany: vi.fn().mockResolvedValue([
          { title: 'Prefer typed errors', content: 'Avoid any.', tags: '["ts"]', importance: 0.9, kind: 'preference' },
        ]),
      },
    },
  },
  memories: { importance: 'importance', kind: 'kind' },
}));

vi.mock('../src/lib/audit.js', () => ({
  appendAudit,
}));

const { syncWorkspace } = await import('../src/services/file-watcher.js');

function makeWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'secb-fw-'));
}

describe('file-watcher: path-traversal containment + audit', () => {
  let dir: string;
  beforeEach(() => {
    appendAudit.mockClear();
    dir = makeWorkspace();
  });

  it('writes IDE files inside the workspace dir only (no escape)', async () => {
    const result = await syncWorkspace(dir, 'secb');
    expect(result.filesWritten.sort()).toEqual(['.cursorrules', 'AGENTS.md', 'CLAUDE.md'].sort());

    for (const f of result.filesWritten) {
      const full = resolve(dir, f);
      // The written path must resolve INSIDE the workspace dir.
      expect(full.startsWith(dir)).toBe(true);
      expect(existsSync(full)).toBe(true);
      // Make sure it did not land at the filesystem root or a sibling dir.
      expect(full).toBe(resolve(dir, f));
    }
  });

  it('always records a workspace.synced audit event', async () => {
    await syncWorkspace(dir, 'secb');
    expect(appendAudit).toHaveBeenCalledTimes(1);
    const [action, payload] = appendAudit.mock.calls[0];
    expect(action).toBe('workspace.synced');
    expect(payload.filesWritten.length).toBe(3);
    expect(typeof payload.conventionsInjected).toBe('number');
  });

  it('backs up an existing file before overwriting it', async () => {
    const target = resolve(dir, 'CLAUDE.md');
    writeFileSync(target, '# existing project rules', 'utf8');
    const result = await syncWorkspace(dir, 'secb');
    expect(result.backupsCreated.length).toBeGreaterThanOrEqual(1);
    const bak = `${target}.bak`;
    expect(existsSync(bak)).toBe(true);
    expect(readFileSync(bak, 'utf8')).toBe('# existing project rules');
  });

  it('does not leak memory content into the audit payload', async () => {
    await syncWorkspace(dir, 'secb');
    const [, payload] = appendAudit.mock.calls[0];
    // Audit records file names + counts, NOT raw convention text.
    expect(JSON.stringify(payload)).not.toMatch(/Prefer typed errors/);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
});
