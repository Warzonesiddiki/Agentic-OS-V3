# memory-tag-taxonomy

## Purpose
Manages the tag taxonomy for memories: a hierarchical, normalised tag tree with create/list/rename/merge/delete
and memory↔tag association. Also detects orphaned and unmanaged tags for hygiene.

## Public exports
- `interface TagNode` — a single tag record.
- `interface TagTreeNode extends TagNode` — tree-augmented node with `children`.
- `function renameTagInList(tags, oldName, newName): string[]` — pure rename helper.
- `function buildTagTree(nodes: TagNode[]): TagTreeNode[]` — builds the forest.
- `function detectOrphanTagNodes(...)` — finds dangling taxonomy nodes.
- `async function createTag(...)`, `getTag(id)`, `listTags()`, `getTagTree()`, `renameTag(id, newName)`,
  `mergeTags(sourceId, targetId)`, `deleteTag(id)`.
- `async function assignTagToMemory(memoryId, tagId)`, `removeTagFromMemory(memoryId, tagId)`.
- `async function detectOrphanTags(): Promise<TagNode[]>`, `detectUnmanagedTags(): Promise<string[]>`.

## Env vars
None directly.

## Test file
- `server/tests/memory-templates.test.ts` (imports tag-taxonomy helpers).
