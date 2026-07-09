# memory-emotion

## Purpose
Affective tagging of memories: a fixed emotion taxonomy, a normalised emotion vector, and async
classification + storage of an emotion vector for a memory's content.

## Public exports
- `const EMOTIONS` — fixed emotion taxonomy array.
- `type Emotion` — member of `EMOTIONS`.
- `type EmotionVector` — `Record<Emotion, number>`.
- `interface EmotionClassification`.
- `function normalizeEmotionVector(input): EmotionVector` — pure normaliser.
- `async function classifyMemoryEmotion(content): Promise<EmotionVector>`.
- `async function storeMemoryEmotion(...)`.

## Env vars
None directly.

## Test file
No dedicated unit test. Covered by `server/tests/memory-perfection.test.ts` (`normalizeEmotionVector`).
