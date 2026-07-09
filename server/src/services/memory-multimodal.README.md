# memory-multimodal

## Purpose
Multimodal memory + attachment handling: image/audio/video/document attachments, caption quality scoring,
language detection/translation, and multimodal memory create/read/update with optional VLM captions.

## Public exports
- `type AttachmentKind`, `type MultimodalKind`, `type LanguageCode`.
- `interface Attachment` / `interface StoreAttachmentInput` / `interface AddMultimodalMemoryInput`.
- `async function storeAttachment(input): Promise<Attachment>`.
- `async function listAttachments(memoryId): Promise<Attachment[]>`.
- `async function nearestAttachments(...)`.
- `function attachmentHash(...)` — pure hash.
- `const CAPTION_QUALITY_THRESHOLD = 0.5`.
- `function scoreCaptionQuality(caption, lang?): number` — pure.
- `function isLowQualityCaption(caption, lang?): boolean` — pure.
- `function detectLanguage(text): LanguageCode` — pure.
- `async function translateMemory(...)` — uses `NEXUS_TRANSLATE_ENDPOINT`.
- `async function addMultimodalMemory(input): Promise<MemoryRow>`.
- `async function updateMultimodalMemory(...)`, `getMultimodalMemory(id)`, `generateImageCaption(blobRef)` (uses `NEXUS_VLM_ENDPOINT`).

## Env vars
- `NEXUS_TRANSLATE_ENDPOINT` — LibreTranslate-compatible URL (optional).
- `NEXUS_VLM_ENDPOINT` — vision-language-model caption endpoint (optional).

## Test file
No dedicated unit test. Exercised via the `routes/memory-multimodal.ts` route handler.
