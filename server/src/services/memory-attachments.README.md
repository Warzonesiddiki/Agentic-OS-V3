# memory-attachments

## Purpose
Manages file/image/code/audio attachments attached to memories. Stores attachment metadata, generates
image thumbnails and syntax-highlighted code previews without external dependencies (pure JS fallbacks).

## Public exports
- `type AttachmentKind` — `'image' | 'code' | 'audio' | 'file'`.
- `interface StoreAttachmentInput` / `interface MemoryAttachment`.
- `async function storeAttachment(...)`, `getAttachments(memoryId)`, `deleteAttachment(id)`.
- `function generateImageThumbnail(input)` — pure-ish thumbnail generator.
- `function highlightCode(code, language?)` — syntax highlight string.

## Env vars
None directly.

## Test file
No dedicated unit test. Exercised via the `routes/memory-attachments.ts` route handler.
