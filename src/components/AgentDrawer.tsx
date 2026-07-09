import { cn } from "./ui";
import type { AgentNodeData, AgentStatus } from "./AgentNode";

interface AgentDrawerProps {
  agent: AgentNodeData | null;
  onClose: () => void;
}

const STATUS_TONES: Record<AgentStatus, string> = {
  idle: "bg-slate-600",
  thinking: "bg-cyan-400",
  executing_tool: "bg-amber-400",
  errored: "bg-rose-500",
  quarantined: "bg-rose-900",
  completed: "bg-emerald-400",
};

export function AgentDrawer({ agent, onClose }: AgentDrawerProps) {
  if (!agent) return null;

  return (
    <div className="nexus-fade fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-nexus-border bg-nexus-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-nexus-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_TONES[agent.status])} />
            <h2 className="text-sm font-semibold text-slate-100">{agent.name}</h2>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200">✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <Section label="Status" value={agent.status} />
          <Section label="Kind" value={agent.kind ?? "agent"} />
          <Section label="Ring" value={agent.ring?.toString() ?? "—"} />
          <Section label="Model" value={agent.llmModel ?? "default"} />
          {agent.currentTool && <Section label="Current Tool" value={agent.currentTool} />}

          {agent.tokensUsed !== undefined && agent.tokenBudget !== undefined && (
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">Token Budget</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    agent.tokensUsed / agent.tokenBudget > 0.8 ? "bg-rose-400" : "bg-cyan-400/60",
                  )}
                  style={{ width: `${Math.min(100, (agent.tokensUsed / agent.tokenBudget) * 100)}%` }}
                />
              </div>
              <div className="mt-1 font-mono text-[11px] text-slate-500">
                {(agent.tokensUsed / 1000).toFixed(1)}k / {(agent.tokenBudget / 1000).toFixed(0)}k
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-sm text-slate-200">{value}</div>
    </div>
  );
}
