import { cn } from "./ui";
import type { AgentNodeData, AgentStatus } from "./AgentNode";
import { useEffect, useId, useRef } from "react";

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
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!agent) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    const panel = panelRef.current;
    const getFocusable = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null)
        : [];
    (getFocusable()[0] ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const nodes = getFocusable();
        if (nodes.length === 0) {
          e.preventDefault();
          panel?.focus();
          return;
        }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused.current?.focus?.();
    };
  }, [agent, onClose]);

  if (!agent) return null;

  return (
    <div className="nexus-fade fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-nexus-border bg-nexus-panel shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-nexus-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_TONES[agent.status])} aria-hidden="true" />
            <h2 id={titleId} className="text-sm font-semibold text-slate-100">{agent.name}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close agent details"
            className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <Section label="Status" value={agent.status} />
          <Section label="Kind" value={agent.kind ?? "agent"} />
          <Section label="Ring" value={agent.ring?.toString() ?? "—"} />
          <Section label="Model" value={agent.llmModel ?? "default"} />
          {agent.currentTool && <Section label="Current Tool" value={agent.currentTool} />}

          {agent.tokensUsed !== undefined && agent.tokenBudget !== undefined && (
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Token Budget
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={agent.tokenBudget}
                aria-valuenow={agent.tokensUsed}
                aria-label="Token budget usage"
              >
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
