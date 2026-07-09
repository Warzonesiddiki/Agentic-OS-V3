/**
 * Tests for server/src/services/memory-templates.ts
 *
 * Memory template CRUD + interpolation. DB is mocked (insert/select/update/delete).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Tpl = {
  id: string;
  name: string;
  ownerAgentId: string;
  template: string;
  variables: string[];
  usageCount: number;
  isPublic: boolean;
};

const store = new Map<string, Tpl>();
let lastId = 0;

function makeDb() {
  return {
    insert: () => ({
      values: (row: Tpl) => ({
        returning: () => {
          const id = 'tpl-' + ++lastId;
          const full = { ...row, id };
          store.set(id, full);
          return Promise.resolve([full]);
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve([...store.values()]),
        }),
      }),
    }),
    update: () => ({
      set: (patch: Partial<Tpl>) => ({
        where: (cond: { id?: string }) => {
          const id = cond?.id;
          if (id) store.set(id, { ...store.get(id)!, ...patch, id });
          return Promise.resolve(undefined);
        },
      }),
    }),
    delete: () => ({
      where: (cond: { id?: string }) => {
        if (cond?.id) store.delete(cond.id);
        return Promise.resolve(undefined);
      },
    }),
  };
}

vi.mock('../src/db/client.js', () => ({
  db: makeDb(),
  memoryTemplates: {},
  isSqlite: true,
}));

vi.mock('../lib/errors.js', () => ({
  ApiError: class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import {
  createMemoryTemplate,
  applyTemplate,
  updateMemoryTemplate,
  deleteMemoryTemplate,
  listMemoryTemplates,
} from '../src/services/memory-templates.js';

beforeEach(() => {
  store.clear();
  lastId = 0;
});

describe('createMemoryTemplate', () => {
  it('creates a template with auto-detected variables', async () => {
    const t = await createMemoryTemplate('agent-1', 'Greeting', 'Hello {{name}}, welcome to {{topic}}');
    expect(t.name).toBe('Greeting');
    expect(t.variables.sort()).toEqual(['name', 'topic']);
    expect(t.usageCount).toBe(0);
  });

  it('accepts explicit variables', async () => {
    const t = await createMemoryTemplate('agent-1', 'T', 'Body', ['x']);
    expect(t.variables).toEqual(['x']);
  });

  it('defaults isPublic to false', async () => {
    const t = await createMemoryTemplate('agent-1', 'T', 'B');
    expect(t.isPublic).toBe(false);
  });

  it('enforces a non-empty name', async () => {
    await expect(createMemoryTemplate('a', '', 'b')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects a template with no variable references and no variables', async () => {
    await expect(createMemoryTemplate('a', 'T', 'static body')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('applyTemplate', () => {
  it('interpolates provided variables', async () => {
    const t = await createMemoryTemplate('agent-1', 'G', 'Hi {{name}}');
    const out = await applyTemplate(t.id, { name: 'Ada' });
    expect(out).toBe('Hi Ada');
    expect(store.get(t.id)!.usageCount).toBe(1);
  });

  it('throws when a required variable is missing', async () => {
    const t = await createMemoryTemplate('agent-1', 'G', 'Hi {{name}}');
    await expect(applyTemplate(t.id, {})).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws for an unknown template', async () => {
    await expect(applyTemplate('nope', {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('increments usageCount on each apply', async () => {
    const t = await createMemoryTemplate('agent-1', 'G', 'Hi {{name}}');
    await applyTemplate(t.id, { name: 'x' });
    await applyTemplate(t.id, { name: 'y' });
    expect(store.get(t.id)!.usageCount).toBe(2);
  });

  it('drops extra (unused) variables without error', async () => {
    const t = await createMemoryTemplate('agent-1', 'G', 'Hi {{name}}');
    const out = await applyTemplate(t.id, { name: 'z', extra: 'ignored' });
    expect(out).toBe('Hi z');
  });
});

describe('updateMemoryTemplate', () => {
  it('updates the template body and re-derives variables', async () => {
    const t = await createMemoryTemplate('agent-1', 'G', 'Hi {{name}}');
    const u = await updateMemoryTemplate(t.id, { template: 'Bye {{who}}' });
    expect(u.template).toBe('Bye {{who}}');
    expect(u.variables).toEqual(['who']);
  });

  it('renames a template', async () => {
    const t = await createMemoryTemplate('agent-1', 'G', 'Hi {{name}}');
    const u = await updateMemoryTemplate(t.id, { name: 'Renamed' });
    expect(u.name).toBe('Renamed');
  });

  it('throws for an unknown template', async () => {
    await expect(updateMemoryTemplate('nope', { name: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deleteMemoryTemplate', () => {
  it('removes a template', async () => {
    const t = await createMemoryTemplate('agent-1', 'G', 'Hi {{name}}');
    await deleteMemoryTemplate(t.id);
    expect(store.has(t.id)).toBe(false);
  });

  it('throws for an unknown template', async () => {
    await expect(deleteMemoryTemplate('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('listMemoryTemplates', () => {
  it('returns all created templates', async () => {
    await createMemoryTemplate('agent-1', 'A', 'Hi {{name}}');
    await createMemoryTemplate('agent-1', 'B', 'Yo {{x}}');
    const list = await listMemoryTemplates();
    expect(list).toHaveLength(2);
  });

  it('returns empty when none exist', async () => {
    expect(await listMemoryTemplates()).toEqual([]);
  });
});
