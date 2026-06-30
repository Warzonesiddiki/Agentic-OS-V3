/**
 * AgentNode.tsx — Futuristic "Orbiting Agent Node" component.
 *
 * Renders an agent as a visual node in the Mission Control HUD.
 * Status-based visual states:
 *   - idle: dim, no glow
 *   - thinking: pulsing cyan radial glow
 *   - executing_tool: solid amber ring with spinning border
 *   - errored: red flashing with glitch effect
 *   - quarantined: locked icon, dark red
 *   - completed: green checkmark, fading
 */

import { cn } from "./ui";

export type AgentStatus = "idle" | "thinking" | "executing_tool" | "errored" | "quarantined" | "completed";

export interface AgentNodeData {
  id: string;
  name: string;
  status: AgentStatus;
  ring?: number;
  kind?: string;
  currentTool?: string;
  llmModel?: string;
  tokensUsed?: number;
  tokenBudget?: number;
}

const STATUS_CONFIG: Record<AgentStatus, {
  label: string;
  dot: string;
  glow: string;
  ring: string;
  icon: string;
  animation?: string;
}> = {
  idle: {
    label: "Idle",
    dot: "bg-slate-600",
    glow: "",
    ring: "border-slate-700/50",
    icon: "○",
  },
  thinking: {
    label: "Thinking",
    dot: "bg-cyan-400",
    glow: "shadow-[0_0_20px_rgba(6,182,212,0.5)]",
    ring: "border-cyan-500/40",
    icon: "🧠",
    animation: "nexus-pulse",
  },
  executing_tool: {
    label: "Executing",
    dot: "bg-amber-400",
    glow: "shadow-[0_0_15px_rgba(251,191,36,0.4)]",
    ring: "border-amber-500/50",
    icon: "⚙",
    animation: "nexus-spin-slow",
  },
  errored: {
    label: "Error",
    dot: "bg-rose-500",
    glow: "shadow-[0_0_20px_rgba(244,63,94,0.6)]",
    ring: "border-rose-500/60",
    icon: "⚠",
    animation: "nexus-glitch",
  },
  quarantined: {
    label: "Quarantined",
    dot: "bg-rose-900",
    glow: "shadow-[0_0_8px_rgba(136,19,55,0.4)]",
    ring: "border-rose-900/60",
    icon: "🔒",
  },
  completed: {
    label: "Done",
    dot: "bg-emerald-400",
    glow: "",
    ring: "border-emerald-500/30",
    icon: "✓",
  },
};

const RING_LABELS: Record<number, string> = {
  0: "KERNEL",
  1: "TRUSTED",
  2: "MCP",
  3: "REMOTE",
  4: "QUARANTINE",
};

export function AgentNode({ agent, onClick }: { agent: AgentNodeData; onClick?: () => void }) {
  const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.idle;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex w-48 flex-col items-center gap-2 rounded-xl border bg-white/[0.03] p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.06]",
        cfg.ring,
        cfg.glow,
        cfg.animation,
      )}
    >
      {/* Status indicator ring */}
      <div className="relative flex h-12 w-12 items-center justify-center">
        <div className={cn(
          "absolute inset-0 rounded-full border-2 transition-all",
          agent.status === "thinking" && "border-cyan-400/60 animate-ping",
          agent.status === "executing_tool" && "border-amber-400/50",
          agent.status === "errored" && "border-rose-500/70",
        )} />
        <div className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full border bg-slate-950/80 text-lg",
          cfg.ring,
        )}>
          {cfg.icon}
        </div>
      </div>

      {/* Agent name */}
      <div className="text-center">
        <div className="truncate text-xs font-medium text-slate-200">{agent.name}</div>
        <div className="mt-0.5 flex items-center justify-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
          <span className="text-[10px] text-slate-500">{cfg.label}</span>
        </div>
      </div>

      {/* Ring badge */}
      {agent.ring !== undefined && (
        <span className="absolute -right-1.5 -top-1.5 rounded-md border border-white/10 bg-slate-950 px-1.5 py-0.5 font-mono text-[8px] tracking-wider text-slate-500">
          R{agent.ring} · {RING_LABELS[agent.ring] ?? "—"}
        </span>
      )}

      {/* Current tool */}
      {agent.currentTool && (
        <div className="w-full truncate rounded bg-amber-500/5 px-2 py-0.5 text-center font-mono text-[9px] text-amber-300/80">
          ⚙ {agent.currentTool}
        </div>
      )}

      {/* Token usage bar */}
      {agent.tokensUsed !== undefined && agent.tokenBudget !== undefined && agent.tokensUsed > 0 && (
        <div className="w-full">
          <div className="h-0.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                agent.tokensUsed / agent.tokenBudget > 0.8 ? "bg-rose-400" : "bg-cyan-400/60",
              )}
              style={{ width: `${Math.min(100, (agent.tokensUsed / agent.tokenBudget) * 100)}%` }}
            />
          </div>
          <div className="mt-0.5 text-center font-mono text-[8px] text-slate-700">
            {(agent.tokensUsed / 1000).toFixed(1)}k / {(agent.tokenBudget / 1000).toFixed(0)}k
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      <div className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 translate-y-full opacity-0 transition-opacity group-hover:opacity-100">
        <div className="whitespace-nowrap rounded-lg border border-white/10 bg-slate-950 px-2 py-1 font-mono text-[9px] text-slate-400 backdrop-blur">
          {agent.llmModel ?? "no-model"} · {agent.kind ?? "agent"}
        </div>
      </div>
    </button>
  );
}

/** Grid of orbiting agent nodes. */
export function AgentNodeGrid({
  agents,
  onSelect,
}: {
  agents: AgentNodeData[];
  onSelect?: (agent: AgentNodeData) => void;
}) {
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <div className="text-3xl opacity-20">◌</div>
        <p className="mt-2 text-sm text-slate-600">No agents active</p>
        <p className="text-xs text-slate-700">Spawn an agent to see it appear here</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {agents.map((agent) => (
        <AgentNode key={agent.id} agent={agent} onClick={() => onSelect?.(agent)} />
      ))}
    </div>
  );
}
