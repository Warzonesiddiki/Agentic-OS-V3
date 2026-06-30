import { useSyncExternalStore } from "react";
import { getOSState, subscribeOS, resetOS, exportOS, importOS } from "./lib/os/store";
import * as kernel from "./lib/os/kernel";
import * as lifecycle from "./lib/os/lifecycle";
import * as diagnostics from "./lib/os/diagnostics";
import { addCard as _addCard } from "./lib/os/kernel";

export function useOS() {
  return useSyncExternalStore(subscribeOS, getOSState, getOSState);
}

/** Flat OS API surfaced to the UI. All functions are the real engine calls. */
export const os = {
  reset: resetOS,
  exportOS,
  importOS,
  addCard: (input: Parameters<typeof _addCard>[0]) => _addCard(input, "operator"),
  // kernel
  syscall: kernel.syscall,
  schedulerTick: kernel.schedulerTick,
  schedulerStatus: kernel.schedulerStatus,
  enqueueTask: kernel.enqueueTask,
  cancelTask: kernel.cancelTask,
  startSaga: kernel.startSaga,
  resolveApproval: kernel.resolveApproval,
  vfsRead: kernel.vfsRead,
  vfsWrite: kernel.vfsWrite,
  vfsList: kernel.vfsList,
  vfsSnapshot: kernel.vfsSnapshot,
  vfsRestore: kernel.vfsRestore,
  heartbeat: kernel.heartbeat,
  detectStuck: kernel.detectStuck,
  quarantine: kernel.quarantine,
  resumeAgent: kernel.resumeAgent,
  publish: kernel.publish,
  ackMessage: kernel.ackMessage,
  deadLetterBus: kernel.deadLetterBus,
  subscribeBus: kernel.subscribeBus,
  compactContext: kernel.compactContext,
  doGraphRecall: kernel.doGraphRecall,
  // lifecycle
  sessionStart: lifecycle.sessionStart,
  hookUserPrompt: lifecycle.hookUserPrompt,
  hookPreToolUse: lifecycle.hookPreToolUse,
  hookPostToolUse: lifecycle.hookPostToolUse,
  hookPreCompact: lifecycle.hookPreCompact,
  hookStop: lifecycle.hookStop,
  hookSessionEnd: lifecycle.hookSessionEnd,
  hookError: lifecycle.hookError,
  createHandoff: lifecycle.createHandoff,
  acceptHandoff: lifecycle.acceptHandoff,
  latestHandoff: lifecycle.latestHandoff,
  dreamRun: lifecycle.dreamRun,
  setCardStability: lifecycle.setCardStability,
  verifyCard: lifecycle.verifyCard,
  linkCards: lifecycle.linkCards,
  // diagnostics
  runDoctor: diagnostics.runDoctor,
  runVerify: diagnostics.runVerify,
  runEvals: diagnostics.runEvals,
  metricsSummary: diagnostics.metricsSummary,
  connectAgent: diagnostics.connectAgent,
  drainScheduler: diagnostics.drainScheduler,
};

export type { Syscall, SyscallResult } from "./lib/os/kernel";
