# memory-templates

## Purpose
Schema-driven memory templates. Defines a field type system and `MemoryTemplateSchema`, validates a memory
against a template, and applies a template to produce a structured memory. Full CRUD over templates.

## Public exports
- `type MemoryTemplateFieldType` — `'string' | 'number' | 'boolean' | 'array' | 'object'`.
- `interface MemoryTemplateField` / `interface MemoryTemplateSchema` / `interface MemoryTemplate`.
- `interface MemoryTemplateInput` / `interface MemoryTemplateMemoryInput` / `interface MemoryTemplateStructuredMemory`.
- `interface ValidationResult` / `interface ApplyTemplateResult`.
- `function validateMemoryAgainstTemplate(...)` — pure.
- `function applyTemplateToMemory(...)` — pure.
- `async function createMemoryTemplate(input): Promise<MemoryTemplate>`.
- `async function getMemoryTemplate(id)`, `listMemoryTemplates()`, `updateMemoryTemplate(...)`, `deleteMemoryTemplate(id)`.
- `async function applyTemplate(...)`.

## Env vars
None directly.

## Test file
- `server/tests/memory-templates.test.ts` (validate/apply + CRUD + tag-taxonomy integration).
