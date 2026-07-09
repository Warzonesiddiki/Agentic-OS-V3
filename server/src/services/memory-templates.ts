import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, memoryTemplates } from '../db/client.js';
import { ApiError } from '../lib/errors.js';

export type MemoryTemplateFieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface MemoryTemplateField {
  type: MemoryTemplateFieldType;
  required?: boolean;
  enum?: ReadonlyArray<string | number | boolean>;
  minLength?: number;
  default?: unknown;
  description?: string;
}

export interface MemoryTemplateSchema {
  type: 'object';
  properties: Record<string, MemoryTemplateField>;
  required?: string[];
}

export interface MemoryTemplate {
  id: string;
  name: string;
  description: string;
  schema: MemoryTemplateSchema;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryTemplateInput {
  name: string;
  description?: string;
  schema: MemoryTemplateSchema;
  isDefault?: boolean;
}

export interface MemoryTemplateMemoryInput {
  kind: string;
  title: string;
  content: string;
  tags?: string[];
  importance?: number;
  language?: string;
  source?: string;
  projectId?: string | null;
}

export interface MemoryTemplateStructuredMemory extends MemoryTemplateMemoryInput {
  tags: string[];
  importance: number;
  language: string;
  source: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ApplyTemplateResult {
  valid: boolean;
  errors: string[];
  structured: MemoryTemplateStructuredMemory;
}

interface MemoryTemplateRow {
  id: string;
  name: string;
  description: string;
  schema: unknown;
  isDefault: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return String(value);
}

function rowToTemplate(row: MemoryTemplateRow): MemoryTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    schema: row.schema as MemoryTemplateSchema,
    isDefault: row.isDefault,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function isPrimitiveOfType(value: unknown, type: MemoryTemplateFieldType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return false;
  }
}

export function validateMemoryAgainstTemplate(
  schema: MemoryTemplateSchema,
  value: Record<string, unknown>
): ValidationResult {
  const errors: string[] = [];
  const requiredFields = schema.required ?? [];
  for (const name of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(value, name)) {
      errors.push(`missing required field: ${name}`);
    }
  }
  const properties = schema.properties ?? {};
  for (const name of Object.keys(properties)) {
    const field = properties[name];
    if (!field) continue;
    if (!Object.prototype.hasOwnProperty.call(value, name)) continue;
    const raw = value[name];
    if (!isPrimitiveOfType(raw, field.type)) {
      errors.push(`field '${name}' must be of type ${field.type}`);
      continue;
    }
    if (field.enum !== undefined && !field.enum.includes(raw as string | number | boolean)) {
      errors.push(`field '${name}' must be one of: ${field.enum.join(', ')}`);
    }
    if (
      field.type === 'string' &&
      typeof raw === 'string' &&
      field.minLength !== undefined &&
      raw.length < field.minLength
    ) {
      errors.push(`field '${name}' must be at least ${field.minLength} characters`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function applyTemplateToMemory(
  template: MemoryTemplate,
  memory: MemoryTemplateMemoryInput
): ApplyTemplateResult {
  const result = validateMemoryAgainstTemplate(
    template.schema,
    memory as unknown as Record<string, unknown>
  );
  const structured: MemoryTemplateStructuredMemory = {
    kind: memory.kind,
    title: memory.title,
    content: memory.content,
    tags: memory.tags ?? [],
    importance: memory.importance ?? 0.5,
    language: memory.language ?? 'unknown',
    source: memory.source ?? 'manual',
  };
  if (memory.projectId !== undefined) {
    structured.projectId = memory.projectId;
  }
  const properties = template.schema.properties ?? {};
  for (const name of Object.keys(properties)) {
    const field = properties[name];
    if (!field) continue;
    if (field.default === undefined) continue;
    if (Object.prototype.hasOwnProperty.call(memory, name)) continue;
    if (name === 'tags' && Array.isArray(field.default)) {
      structured.tags = field.default as string[];
    } else if (name === 'importance' && typeof field.default === 'number') {
      structured.importance = field.default;
    } else if (name === 'language' && typeof field.default === 'string') {
      structured.language = field.default;
    } else if (name === 'source' && typeof field.default === 'string') {
      structured.source = field.default;
    }
  }
  return { valid: result.valid, errors: result.errors, structured };
}

function newId(): string {
  return `mt_${randomUUID()}`;
}

function isUniqueViolation(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const candidate = err as { code?: unknown; message?: unknown };
  if (candidate.code === '23505') return true;
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return message.includes('unique') || message.includes('duplicate');
}

export async function createMemoryTemplate(input: MemoryTemplateInput): Promise<MemoryTemplate> {
  const id = newId();
  const now = new Date();
  const row: MemoryTemplateRow = {
    id,
    name: input.name,
    description: input.description ?? '',
    schema: input.schema,
    isDefault: input.isDefault ?? false,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.insert(memoryTemplates).values({
      id: row.id,
      name: row.name,
      description: row.description,
      schema: row.schema,
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError('VALIDATION_ERROR', 'template name already exists');
    }
    throw err;
  }
  return rowToTemplate(row);
}

export async function getMemoryTemplate(id: string): Promise<MemoryTemplate | null> {
  const rows = await db.select().from(memoryTemplates).where(eq(memoryTemplates.id, id)).limit(1);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rowToTemplate(rows[0] as MemoryTemplateRow);
}

export async function listMemoryTemplates(): Promise<MemoryTemplate[]> {
  const rows = await db.select().from(memoryTemplates).orderBy(memoryTemplates.name);
  return (Array.isArray(rows) ? rows : []).map((r) => rowToTemplate(r as MemoryTemplateRow));
}

export async function updateMemoryTemplate(
  id: string,
  patch: Partial<MemoryTemplateInput>
): Promise<MemoryTemplate> {
  const existing = await getMemoryTemplate(id);
  if (!existing) throw new ApiError('NOT_FOUND', 'template not found');
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.schema !== undefined) values.schema = patch.schema;
  if (patch.isDefault !== undefined) values.isDefault = patch.isDefault;
  await db.update(memoryTemplates).set(values).where(eq(memoryTemplates.id, id));
  const updated = await getMemoryTemplate(id);
  if (!updated) throw new ApiError('NOT_FOUND', 'template not found after update');
  return updated;
}

export async function deleteMemoryTemplate(id: string): Promise<void> {
  const existing = await getMemoryTemplate(id);
  if (!existing) throw new ApiError('NOT_FOUND', 'template not found');
  await db.delete(memoryTemplates).where(eq(memoryTemplates.id, id));
}

export async function applyTemplate(
  templateId: string,
  memory: MemoryTemplateMemoryInput
): Promise<MemoryTemplateStructuredMemory> {
  const template = await getMemoryTemplate(templateId);
  if (!template) throw new ApiError('NOT_FOUND', 'template not found');
  const result = applyTemplateToMemory(template, memory);
  if (!result.valid) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `memory does not match template: ${result.errors.join('; ')}`
    );
  }
  return result.structured;
}
