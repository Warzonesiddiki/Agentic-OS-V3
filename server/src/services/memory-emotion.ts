import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/client.js';
import { callLLMStructuredWithTrajectory } from './llm-client.js';
import type { Table } from 'drizzle-orm';

export const EMOTIONS = [
  'joy',
  'surprise',
  'fear',
  'anger',
  'sadness',
  'disgust',
  'trust',
  'anticipation',
] as const;

export type Emotion = (typeof EMOTIONS)[number];

export type EmotionVector = Record<Emotion, number>;

const emotionSchema = z.object({
  joy: z.number().min(0).max(1),
  surprise: z.number().min(0).max(1),
  fear: z.number().min(0).max(1),
  anger: z.number().min(0).max(1),
  sadness: z.number().min(0).max(1),
  disgust: z.number().min(0).max(1),
  trust: z.number().min(0).max(1),
  anticipation: z.number().min(0).max(1),
});

export interface EmotionClassification {
  memoryId: string;
  emotions: EmotionVector;
  model: string;
  classifiedAt: string;
}

const SYSTEM_PROMPT =
  'You are an emotion classifier for memory contents. ' +
  'Given the text of a memory, estimate its emotional tone along 8 dimensions. ' +
  'Return a JSON object with exactly these keys, each a number from 0 to 1: ' +
  'joy, surprise, fear, anger, sadness, disgust, trust, anticipation. ' +
  '0 means the emotion is absent; 1 means it is strongly present. ' +
  'Be objective and base judgments only on the text provided.';

const AGENT_ID = 'nexus-memory-emotion';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function normalizeEmotionVector(input: Record<string, unknown>): EmotionVector {
  const out = {} as EmotionVector;
  for (const emotion of EMOTIONS) {
    const raw = input[emotion];
    out[emotion] = clamp01(typeof raw === 'number' ? raw : 0);
  }
  return out;
}

export async function classifyMemoryEmotion(content: string): Promise<EmotionVector> {
  const parsed = await callLLMStructuredWithTrajectory(
    SYSTEM_PROMPT,
    content.slice(0, 8000),
    emotionSchema,
    { agentId: AGENT_ID, circuitBreakerKey: 'memory-emotion' }
  );
  return normalizeEmotionVector(parsed as unknown as Record<string, unknown>);
}

export async function storeMemoryEmotion(
  memoryId: string,
  content: string,
  opts?: { model?: string }
): Promise<EmotionClassification> {
  const emotions = await classifyMemoryEmotion(content);
  const model = opts?.model ?? 'unknown';
  const table = await getMemoryEmotionsTable();
  await db.insert(table).values({
    id: `emo_${randomUUID()}`,
    memoryId,
    joy: emotions.joy,
    surprise: emotions.surprise,
    fear: emotions.fear,
    anger: emotions.anger,
    sadness: emotions.sadness,
    disgust: emotions.disgust,
    trust: emotions.trust,
    anticipation: emotions.anticipation,
    model,
    createdAt: new Date(),
  } as Record<string, unknown>);
  return {
    memoryId,
    emotions,
    model,
    classifiedAt: new Date().toISOString(),
  };
}

async function getMemoryEmotionsTable(): Promise<Table> {
  const schema = (await import('../db/schema.js')) as { memoryEmotions?: Table };
  const table = schema.memoryEmotions;
  if (!table) throw new Error('memoryEmotions table is not defined in schema');
  return table;
}
