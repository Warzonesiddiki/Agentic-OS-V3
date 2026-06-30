import { useSyncExternalStore } from "react";
import { getState, subscribe, resetBrain, wipeBrain, getPersistenceStatus } from "./lib/engine";
import { getConfig, getLocalKey, subscribeConfig } from "./lib/config";
import * as ops from "./lib/operations";
import { ambient, recall as doRecall } from "./lib/recall";
import { getRemote, remote, remoteEnabled, subscribeRemote, autoDetect } from "./lib/remote";
import {
  addVaultFile,
  compressBrain,
  exportBrain,
  importBrain,
  indexVault,
  rebuildEmbeddings,
  verifyAudit,
  writeBack,
} from "./lib/brain";
import { handle } from "./lib/api";
import type { CaptureInput, CheckpointInput, MemoryInput, SkillInput, TransferInput } from "./lib/types";

const ACTOR = "local-operator";
let syncTimer: ReturnType<typeof setInterval> | null = null;
let lastSyncAt = 0;
const SYNC_STALE_MS = 10_000;

export function useNexus() {
  return useSyncExternalStore(subscribe, getState, getState);
}
export function useConfig() {
  return useSyncExternalStore(subscribeConfig, getConfig, getConfig);
}
export function useRemote() {
  return useSyncExternalStore(subscribeRemote, getRemote, getRemote);
}

/** Local-mode operator key (auto-authenticated in the UI; usable in the API Console). */
export const LOCAL_KEY = getLocalKey();

/**
 * Write operation route: fires remote call + syncs local state after,
 * but returns the local result immediately (UI stays responsive).
 * The sync completes in the background and triggers a re-render via useNexus().
 */
function route<T>(local: () => T, remoteFn: () => Promise<unknown>): T {
  if (remoteEnabled()) {
    remoteFn().then(() => syncFromRemote()).catch(() => {});
    return local();
  }
  return local();
}

/**
 * Start periodic background sync when remote mode is active.
 * Call from the top-level App component.
 * Probes the server on first call — if reachable, auto-enables remote.
 */
export async function startRemoteSync(): Promise<void> {
  if (syncTimer) return;
  await autoDetect();
  if (!remoteEnabled()) return;
  syncFromRemote(); // immediate sync on init
  syncTimer = setInterval(() => { if (remoteEnabled()) syncFromRemote(); }, 30_000);
  // Also sync when the user returns to the tab
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && remoteEnabled()) syncFromRemote();
  });
}

/**
 * Sync the full local state from the remote server.
 * Call after mutations when remote is enabled to refresh the UI.
 * Syncs memories, skills, and notes so local reads return fresh data.
 */
export async function syncFromRemote(): Promise<void> {
  if (!remoteEnabled()) return;
  const { getState, commit } = await import("./lib/engine");
  try {
    interface ListResponse { total: number; items: unknown[] }
    const [memRes, sklRes] = await Promise.all([
      remote.listMemories() as Promise<ListResponse>,
      remote.listSkills() as Promise<ListResponse>,
    ]);
    commit({
      ...getState(),
      memories: memRes.items as import("./lib/types").Memory[],
      skills: sklRes.items as import("./lib/types").Skill[],
    });
    lastSyncAt = Date.now();
  } catch {
    // Remote unreachable — keep local state
  }
}

/** Fire a background sync if local state is stale (no-op if recently synced). */
function syncIfStale(): void {
  if (remoteEnabled() && Date.now() - lastSyncAt > SYNC_STALE_MS) {
    syncFromRemote();
  }
}

export const nexus = {
  actor: ACTOR,
  getPersistenceStatus,
  createMemory: (i: MemoryInput) =>
    route(() => ops.createMemory(i, ACTOR), () => remote.createMemory(i)),
  updateMemory: (id: string, p: Partial<MemoryInput>) =>
    route(() => ops.updateMemory(id, p, ACTOR), () => remote.updateMemory(id, p as Record<string, unknown>)),
  deleteMemory: (id: string) =>
    route(() => ops.deleteMemory(id, ACTOR), () => remote.deleteMemory(id)),
  createSkill: (i: SkillInput) =>
    route(() => ops.createSkill(i, ACTOR), () => remote.createSkill(i)),
  updateSkill: (id: string, p: Partial<SkillInput>) =>
    route(() => ops.updateSkill(id, p, ACTOR), () => remote.updateSkill(id, p as Record<string, unknown>)),
  deleteSkill: (id: string) =>
    route(() => ops.deleteSkill(id, ACTOR), () => remote.deleteSkill(id)),
  recordOutcome: (id: string, o: "success" | "failure") =>
    route(() => ops.recordSkillOutcome(id, o, ACTOR), () => remote.recordOutcome(id, o)),
  capture: (i: CaptureInput) =>
    route(() => ops.captureSession(i, ACTOR), () => remote.capture(i.transcript, i.projectName)),
  checkpoint: (i: CheckpointInput) =>
    route(() => ops.checkpoint(i, ACTOR), () => remote.checkpoint(i.label, i.context, i.projectName)),
  transfer: (i: TransferInput) =>
    route(() => ops.transferProject(i, ACTOR), () => remote.transfer(i)),
  recall: (q: string, b: number) => {
    syncIfStale();
    return route(() => doRecall(q, b, ACTOR), () => remote.recall(q, b));
  },
  feedback: (q: string, itemId: string, t: "memory" | "skill" | "note", h: boolean) =>
    route(() => ops.recordFeedback(q, itemId, t, h, ACTOR), () => remote.feedback(q, itemId, t, h)),
  killSwitch: (enabled: boolean, reason?: string) =>
    route(() => ops.tripKillSwitch(enabled, reason, ACTOR), () => remote.killSwitch(enabled, reason)),
  heartbeat: () =>
    route(() => ops.heartbeat(), () => remote.heartbeat()),
  addVaultFile: (p: string, c: string) =>
    route(() => addVaultFile(p, c, ACTOR), () => remote.syncVault()),
  indexVault: () =>
    route(() => indexVault(ACTOR), () => remote.syncVault()),
  writeBack: (id: string, path?: string) =>
    route(() => writeBack(id, path, ACTOR), () => remote.syncVault()),
  ambient: () => {
    syncIfStale();
    return ambient();
  },
  exportBrain: () => {
    syncIfStale();
    return route(() => exportBrain(), () => remote.exportBrain());
  },
  importBrain: (data: unknown) =>
    route(() => importBrain(data, ACTOR), () => remote.importBrain(data)),
  compressBrain: () =>
    route(() => compressBrain(ACTOR), () => remote.compressBrain()),
  verifyAudit: () => {
    syncIfStale();
    return route(() => verifyAudit(), () => remote.verifyAudit().then((r) => ({ valid: r.valid, entries: r.verifiedEntries, brokenAt: null, total: 0 })));
  },
  rebuildEmbeddings: () =>
    route(() => rebuildEmbeddings(), () => remote.rebuildEmbeddings()),
  reset: resetBrain,
  wipe: wipeBrain,
  // Security lab utilities (pure)
  detectSecrets: ops.detectSecrets,
  detectPromptInjection: ops.detectPromptInjection,
  isPrivateHost: ops.isPrivateHost,
  safeVaultPath: ops.safeVaultPath,
  verifyConstantTime: ops.verifyConstantTime,
};

export { handle };
export type { ApiRequest, ApiResponse } from "./lib/api";
