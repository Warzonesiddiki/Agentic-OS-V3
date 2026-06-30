/**
 * services/signal-hooks.ts — Typed Async Event Emitter for Agent Lifecycle.
 *
 * Inspired by OpenAI SDK RunHooks and CrewAI callbacks. Provides a typed
 * event system with async handlers, timeout, continue-on-error, and chaining.
 *
 * Events:
 *   on_agent_start  — fired when an agent begins execution
 *   on_agent_end    — fired when an agent finishes (success or failure)
 *   on_tool_start   — fired before a tool call
 *   on_tool_end     — fired after a tool call completes
 *   on_handoff      — fired when an agent hands off to another agent
 */
import { log } from "../lib/logging.js";

export type SignalEvent =
  | "on_agent_start"
  | "on_agent_end"
  | "on_tool_start"
  | "on_tool_end"
  | "on_handoff";

export interface AgentStartContext {
  agentId: string;
  goal: string;
  parentId?: string;
  actor: string;
  timestamp: number;
}

export interface AgentEndContext {
  agentId: string;
  ok: boolean;
  answer: string;
  iterations: number;
  tokensUsed: number;
  error?: string;
  timestamp: number;
}

export interface ToolStartContext {
  agentId: string;
  tool: string;
  input: unknown;
  timestamp: number;
}

export interface ToolEndContext {
  agentId: string;
  tool: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  error?: string;
  timestamp: number;
}

export interface HandoffContext {
  fromAgentId: string;
  toAgentId: string;
  payload: unknown;
  timestamp: number;
}

export type SignalContext =
  | AgentStartContext
  | AgentEndContext
  | ToolStartContext
  | ToolEndContext
  | HandoffContext;

export type SignalHandler<T extends SignalContext = SignalContext> = (ctx: T) => Promise<void> | void;

export interface SignalHook<T extends SignalContext = SignalContext> {
  event: SignalEvent;
  handler: SignalHandler<T>;
  priority: number;
  timeoutMs: number;
  name: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;

type HookMap = Partial<Record<SignalEvent, SignalHook[]>>;

let hooks: HookMap = {};

function ensureSlot(event: SignalEvent): SignalHook[] {
  if (!hooks[event]) hooks[event] = [];
  return hooks[event]!;
}

export function clearAllHooks(): void {
  hooks = {};
}

/**
 * Register a signal handler for a lifecycle event.
 * Returns an unregister function. Handlers are sorted by priority (highest first).
 */
export function registerHook<T extends SignalContext = SignalContext>(
  event: SignalEvent,
  handler: SignalHandler<T>,
  options?: Partial<Pick<SignalHook<T>, "priority" | "timeoutMs" | "name">>,
): () => void {
  const slot = ensureSlot(event);
  const hook: SignalHook<T> = {
    event,
    handler,
    priority: options?.priority ?? 0,
    timeoutMs: Math.min(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS),
    name: options?.name ?? (handler.name || "anonymous"),
  };
  slot.push(hook as SignalHook);
  slot.sort((a, b) => b.priority - a.priority);
  return () => {
    const idx = slot.indexOf(hook as SignalHook);
    if (idx >= 0) slot.splice(idx, 1);
  };
}

export function listHooks(): Array<{ event: SignalEvent; name: string; priority: number }> {
  const result: Array<{ event: SignalEvent; name: string; priority: number }> = [];
  for (const event of Object.keys(hooks) as SignalEvent[]) {
    for (const h of hooks[event] ?? []) {
      result.push({ event: h.event, name: h.name, priority: h.priority });
    }
  }
  return result;
}

async function runHandler(handler: SignalHook, ctx: SignalContext): Promise<void> {
  const start = Date.now();
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Hook "${handler.name}" timed out after ${handler.timeoutMs}ms`)), handler.timeoutMs),
  );
  try {
    await Promise.race([handler.handler(ctx), timer]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn("signal_hook_error", { event: handler.event, name: handler.name, error: msg, elapsedMs: Date.now() - start });
  }
}

/**
 * Emit a signal event to all registered hooks for that event type.
 * All handlers run concurrently with individual timeouts; errors are logged but do not propagate.
 */
export async function emitSignal(event: SignalEvent, ctx: SignalContext): Promise<void> {
  const matched = hooks[event];
  if (!matched || matched.length === 0) return;
  const tags = { event, hookCount: matched.length };
  log.debug("signal_emit", tags);
  const promises = matched.map((h) => runHandler(h, ctx));
  await Promise.all(promises);
}

export function createChainedHook(...events: SignalEvent[]): {
  event: "on_handoff";
  handler: SignalHandler<HandoffContext>;
  priority: number;
  timeoutMs: number;
  name: string;
} {
  const chainName = `chain:${events.join(">")}`;
  return {
    event: "on_handoff",
    handler: async (ctx: HandoffContext) => {
      for (const evt of events) {
        await emitSignal(evt, ctx);
      }
    },
    priority: 100,
    timeoutMs: MAX_TIMEOUT_MS,
    name: chainName,
  };
}

/**
 * Compose multiple hooks into a single sequential hook.
 * Each sub-hook runs in order; the composed hook adopts the highest priority and cumulative timeout.
 */
export function composeHooks(...hooksToCompose: SignalHook[]): SignalHook {
  const name = `compose:${hooksToCompose.map((h) => h.name).join("+")}`;
  return {
    event: hooksToCompose[0]?.event ?? "on_agent_start",
    handler: async (ctx: SignalContext) => {
      for (const h of hooksToCompose) {
        await runHandler(h, ctx);
      }
    },
    priority: Math.max(...hooksToCompose.map((h) => h.priority)),
    timeoutMs: hooksToCompose.reduce((acc, h) => acc + h.timeoutMs, 0),
    name,
  };
}
