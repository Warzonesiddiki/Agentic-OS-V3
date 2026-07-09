// server/src/services/ranking-trainer.ts
//
// Lightweight linear ranker that learns a blend of recall features from user
// feedback, replacing the static recall weights (W_RRF / W_IMPORTANCE /
// W_RECENCY / W_FEEDBACK) with a learned blend.
//
// The feature vector mirrors recall.ts:
//   score = w.rrf*rrf + w.importance*importance + w.recency*recency + w.feedback*feedback

export interface RankingFeatures {
  rrf: number;
  importance: number;
  recency: number;
  feedback: number;
}

export interface FeedbackTriple {
  features: RankingFeatures;
  helpful: boolean;
}

export interface RankerWeights {
  rrf: number;
  importance: number;
  recency: number;
  feedback: number;
}

export interface StoredFeedback {
  query: string;
  itemId: string;
  itemType: string;
  helpful: boolean;
  createdAt?: Date;
}

export interface FeedbackStore {
  getAll(): StoredFeedback[] | Promise<StoredFeedback[]>;
}

export interface RankCandidate {
  id: string;
  rrf: number;
  importance: number;
  recency: number;
  feedback: number;
}

export interface RankedCandidate {
  id: string;
  score: number;
}

export const DEFAULT_WEIGHTS: RankerWeights = {
  rrf: 0.5,
  importance: 0.3,
  recency: 0.1,
  feedback: 0.1,
};

type Coeffs = [number, number, number, number];
type FeatVec = [number, number, number, number];

let currentWeights: RankerWeights = { ...DEFAULT_WEIGHTS };

export function getRankerWeights(): RankerWeights {
  return { ...currentWeights };
}

export function resetRankerWeights(): void {
  currentWeights = { ...DEFAULT_WEIGHTS };
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function toFeatVec(features: RankingFeatures): FeatVec {
  return [
    clamp01(features.rrf),
    clamp01(features.importance),
    clamp01(features.recency),
    clamp01(features.feedback),
  ];
}

export function trainRanker(
  triples: FeedbackTriple[],
  options?: { learningRate?: number; epochs?: number; regularization?: number }
): RankerWeights {
  const learningRate = options?.learningRate ?? 0.5;
  const epochs = options?.epochs ?? 200;
  const regularization = options?.regularization ?? 1e-3;

  if (triples.length === 0) {
    currentWeights = { ...DEFAULT_WEIGHTS };
    return { ...DEFAULT_WEIGHTS };
  }

  const w: Coeffs = [0, 0, 0, 0];

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (const triple of triples) {
      const x = toFeatVec(triple.features);
      const z = w[0] * x[0] + w[1] * x[1] + w[2] * x[2] + w[3] * x[3];
      const p = 1 / (1 + Math.exp(-z));
      const y = triple.helpful ? 1 : 0;
      const gradScale = p - y;
      w[0] -= learningRate * (gradScale * x[0] + regularization * w[0]);
      w[1] -= learningRate * (gradScale * x[1] + regularization * w[1]);
      w[2] -= learningRate * (gradScale * x[2] + regularization * w[2]);
      w[3] -= learningRate * (gradScale * x[3] + regularization * w[3]);
    }
  }

  const blend: Coeffs = [
    Math.max(w[0], 0),
    Math.max(w[1], 0),
    Math.max(w[2], 0),
    Math.max(w[3], 0),
  ];
  const sum = blend[0] + blend[1] + blend[2] + blend[3];

  const result: RankerWeights =
    sum <= 0
      ? { ...DEFAULT_WEIGHTS }
      : {
          rrf: blend[0] / sum,
          importance: blend[1] / sum,
          recency: blend[2] / sum,
          feedback: blend[3] / sum,
        };

  currentWeights = result;
  return { ...result };
}

export function rankWithLearnedWeights(
  candidates: RankCandidate[],
  weights: RankerWeights = currentWeights
): RankedCandidate[] {
  const scored: RankedCandidate[] = candidates.map((candidate) => ({
    id: candidate.id,
    score:
      weights.rrf * candidate.rrf +
      weights.importance * candidate.importance +
      weights.recency * candidate.recency +
      weights.feedback * candidate.feedback,
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return 0;
  });

  return scored;
}

export async function buildTriplesFromStore(
  store: FeedbackStore,
  featuresById: ReadonlyMap<string, RankingFeatures>
): Promise<FeedbackTriple[]> {
  const records = await store.getAll();
  const result: FeedbackTriple[] = [];
  for (const record of records) {
    const features = featuresById.get(record.itemId);
    if (features) {
      result.push({ features, helpful: record.helpful });
    }
  }
  return result;
}
