/**
 * Tests for server/src/services/memory-templates.ts
 *
 * JSON-schema-based memory templates: create/get/list/update/delete + apply
 * (validate a memory against the template schema). DB is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeDrizzleMock } from './helpers/drizzle-mock.ts';
import type { Row } from './helpers/drizzle-mock-types.ts';

const h = vi.hoisted(() => {
  const store = new Map<string, Row>();
  return { store };
});

vi.mock('../src/db/client.js', () => ({
  db: makeDrizzleMock(h.store),
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
  getMemoryTemplate,
  listMemoryTemplates,
  updateMemoryTemplate,
  deleteMemoryTemplate,
  applyTemplate,
  validateMemoryAgainstTemplate,
  applyTemplateToMemory,
  type MemoryTemplateSchema,
} from '../src/services/memory-templates.js';

beforeEach(() => {
  h.store.clear();
});

const personSchema: MemoryTemplateSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', required: true },
    age: { type: 'number' },
    role: { type: 'string', enum: ['admin', 'user'] },
  },
  required: ['name'],
};

describe('createMemoryTemplate', () => {
  it('creates a template and returns it with an id', async () => {
    const t = await createMemoryTemplate({ name: 'Person', schema: personSchema });
    expect(t.id).toMatch(/^mt_/);
    expect(t.name).toBe('Person');
    expect(t.schema).toEqual(personSchema);
    expect(t.isDefault).toBe(false);
  });
  it('honors isDefault', async () => {
    const t = await createMemoryTemplate({ name: 'P', schema: personSchema, isDefault: true });
    expect(t.isDefault).toBe(true);
  });
  it('stores the row so getMemoryTemplate can retrieve it', async () => {
    const t = await createMemoryTemplate({ name: 'P', schema: personSchema });
    const got = await getMemoryTemplate(t.id);
    expect(got?.id).toBe(t.id);
  });
});

describe('getMemoryTemplate', () => {
  it('returns null for an unknown id', async () => {
    expect(await getMemoryTemplate('nope')).toBeNull();
  });
  it('returns a stored template', async () => {
    const t = await createMemoryTemplate({ name: 'P', schema: personSchema });
    const got = await getMemoryTemplate(t.id);
    expect(got?.name).toBe('P');
  });
});

describe('listMemoryTemplates', () => {
  it('returns all templates ordered by name', async () => {
    await createMemoryTemplate({ name: 'B', schema: personSchema });
    await createMemoryTemplate({ name: 'A', schema: personSchema });
    const list = await listMemoryTemplates();
    expect(list.map((t) => t.name)).toEqual(['A', 'B']);
  });
  it('returns empty when none exist', async () => {
    expect(await listMemoryTemplates()).toEqual([]);
  });
});

describe('updateMemoryTemplate', () => {
  it('renames a template', async () => {
    const t = await createMemoryTemplate({ name: 'P', schema: personSchema });
    const u = await updateMemoryTemplate(t.id, { name: 'Renamed' });
    expect(u.name).toBe('Renamed');
  });
  it('throws NOT_FOUND for an unknown template', async () => {
    await expect(updateMemoryTemplate('nope', { name: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deleteMemoryTemplate', () => {
  it('removes a template', async () => {
    const t = await createMemoryTemplate({ name: 'P', schema: personSchema });
    await deleteMemoryTemplate(t.id);
    expect(await getMemoryTemplate(t.id)).toBeNull();
  });
  it('throws NOT_FOUND for an unknown template', async () => {
    await expect(deleteMemoryTemplate('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('applyTemplate', () => {
  it('validates and structures a matching memory', async () => {
    const t = await createMemoryTemplate({ name: 'P', schema: personSchema });
    const res = await applyTemplate(t.id, { kind: 'fact', title: 't', content: 'c', name: 'Ada', age: 30, role: 'admin' });
    expect(res.content).toBe('c');
    expect(res.importance).toBe(0.5);
  });
  it('throws when a required field is missing', async () => {
    const t = await createMemoryTemplate({ name: 'P', schema: personSchema });
    await expect(applyTemplate(t.id, { kind: 'fact', title: 't', content: 'c' })).rejects.toThrow(/name/);
  });
  it('throws for an invalid enum value', async () => {
    const t = await createMemoryTemplate({ name: 'P', schema: personSchema });
    await expect(applyTemplate(t.id, { kind: 'fact', title: 't', content: 'c', name: 'Ada', role: 'guest' })).rejects.toThrow(/role/);
  });
  it('throws NOT_FOUND for an unknown template', async () => {
    await expect(applyTemplate('nope', { kind: 'fact', title: 't', content: 'c' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('validateMemoryAgainstTemplate (pure)', () => {
  it('passes a valid object', () => {
    const r = validateMemoryAgainstTemplate(personSchema, { name: 'x', age: 1 });
    expect(r.valid).toBe(true);
  });
  it('fails a missing required property', () => {
    const r = validateMemoryAgainstTemplate(personSchema, { age: 1 });
    expect(r.valid).toBe(false);
  });
  it('fails a type mismatch', () => {
    const r = validateMemoryAgainstTemplate(personSchema, { name: 42 });
    expect(r.valid).toBe(false);
  });
});

describe('applyTemplateToMemory (pure)', () => {
  it('fills default importance when not provided', () => {
    const t = { id: 'x', name: 'P', description: '', schema: personSchema, isDefault: false, createdAt: '', updatedAt: '' };
    const r = applyTemplateToMemory(t, { kind: 'fact', title: 't', content: 'c', name: 'Ada' });
    expect(r.structured.importance).toBe(0.5);
  });
  it('preserves a provided importance', () => {
    const t = { id: 'x', name: 'P', description: '', schema: personSchema, isDefault: false, createdAt: '', updatedAt: '' };
    const r = applyTemplateToMemory(t, { kind: 'fact', title: 't', content: 'c', name: 'Ada', importance: 0.9 });
    expect(r.structured.importance).toBe(0.9);
  });
});
