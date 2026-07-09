import type { Memory, Skill, Project, Note, AuditEntry, LedgerEntry } from './types';

interface CacheState {
  memories: Memory[];
  skills: Skill[];
  projects: Project[];
  notes: Note[];
  audit: AuditEntry[];
  ledger: LedgerEntry[];
  killSwitch: boolean;
  killSwitchReason?: string;
  auditTrailValid?: boolean;
}

let cacheState: CacheState = {
  memories: [],
  skills: [],
  projects: [],
  notes: [],
  audit: [],
  ledger: [],
  killSwitch: false,
};

const listeners = new Set<() => void>();

export function getCacheState(): CacheState {
  return cacheState;
}

export function updateCacheState(patch: Partial<CacheState>) {
  cacheState = { ...cacheState, ...patch };
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
