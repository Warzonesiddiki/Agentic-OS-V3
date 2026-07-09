import type { TelemetrySnapshot, TunerValue, OwnerAgent } from './types.js';

export interface LiveWriteConfig {
  targetInterface: string;
  ownerAgent: OwnerAgent | string;
  liveSetter: (delta: Record<string, TunerValue>) => Promise<void> | void;
}

export interface LiveWriteAdapter {
  targetInterface: string;
  ownerAgent: string;
  hasLiveSetter(): boolean;
  readState(_snapshot: TelemetrySnapshot): Promise<Record<string, TunerValue>>;
  apply(delta: Record<string, TunerValue>): Promise<Record<string, TunerValue>>;
}

export function createLiveWriteAdapter(config: LiveWriteConfig): LiveWriteAdapter {
  return {
    targetInterface: config.targetInterface,
    ownerAgent: String(config.ownerAgent),
    hasLiveSetter() {
      return typeof config.liveSetter === 'function';
    },
    async readState() {
      return {};
    },
    async apply(delta) {
      await config.liveSetter(delta);
      return delta;
    },
  };
}

const VALID_POLICIES = ['mlfq', 'edf', 'fairshare'];

// 18.19 / 18.20-style RL scheduler policy writer (LIVE Forge setter)
export const rlSchedulingAdapter: LiveWriteAdapter = {
  targetInterface: 'scheduler.ts:setSchedulingPolicy',
  ownerAgent: 'forge',
  hasLiveSetter() {
    return true;
  },
  async readState(s) {
    return { policy: s.scheduler.policy };
  },
  async apply(delta) {
    const policy = String(delta.policy ?? '');
    if (VALID_POLICIES.includes(policy)) {
      const mod = await import('../scheduler.js').catch(() => ({
        setSchedulingPolicy: undefined as unknown,
      }));
      const fn = (mod as Record<string, unknown>)['setSchedulingPolicy'] as
        ((p: string) => void) | undefined;
      if (typeof fn === 'function') fn(policy);
    }
    return delta;
  },
};

// 18.7 / 18.2 queue auto-scaler writer (LIVE Forge setter, clamped [1,50])
export const queueAutoScalerAdapter: LiveWriteAdapter = {
  targetInterface: 'task-worker.ts:configureWorker',
  ownerAgent: 'forge',
  hasLiveSetter() {
    return true;
  },
  async readState(s) {
    return { desiredCapacity: s.scheduler.queueDepth };
  },
  async apply(delta) {
    const raw = Number(delta.desiredCapacity);
    const clamped = Math.max(1, Math.min(50, Number.isFinite(raw) ? raw : 1));
    if (clamped >= 1 && clamped <= 50) {
      const mod = await import('../task-worker.js').catch(() => ({
        configureWorker: undefined as unknown,
      }));
      const fn = (mod as Record<string, unknown>)['configureWorker'] as
        ((o: Record<string, number>) => void) | undefined;
      if (typeof fn === 'function') fn({ maxConcurrency: clamped });
    }
    return delta;
  },
};

// 18.5 memory/recall threshold writer (ADVISORY — no live setter)
export const memoryThresholdAdapter: LiveWriteAdapter = {
  targetInterface: 'recall.ts:setBudget',
  ownerAgent: 'mnemosyne',
  hasLiveSetter() {
    return false;
  },
  async readState(s) {
    return { semanticThreshold: s.recall.missRate };
  },
  async apply(delta) {
    // advisory echo only — Pulse never mutates recall directly
    return delta;
  },
};

export const ADAPTERS: Record<string, LiveWriteAdapter> = {
  '18.7': queueAutoScalerAdapter,
  '18.20': rlSchedulingAdapter,
  '18.5': memoryThresholdAdapter,
};
