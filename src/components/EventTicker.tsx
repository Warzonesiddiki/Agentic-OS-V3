import { cn } from "./ui";

export interface TickerEvent {
  id: string;
  type: "agent.state" | "task.update" | "cron.fired" | "audit.appended" | "approval.requested";
  label: string;
  timestamp: number;
}

interface EventTickerProps {
  events: TickerEvent[];
  className?: string;
}

const TONE: Record<string, string> = {
  "agent.state": "text-cyan-300",
  "task.update": "text-amber-300",
  "cron.fired": "text-emerald-300",
  "audit.appended": "text-violet-300",
  "approval.requested": "text-rose-300",
};

const ICON: Record<string, string> = {
  "agent.state": "◈",
  "task.update": "⚙",
  "cron.fired": "◌",
  "audit.appended": "◆",
  "approval.requested": "△",
};

export function EventTicker({ events, className }: EventTickerProps) {
  if (events.length === 0) return null;

  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-nexus-border bg-nexus-panel px-4 py-2", className)}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="Live event feed"
    >
      <div className="nexus-ticker flex items-center gap-8 whitespace-nowrap">
        {events.map((event) => (
          <span key={event.id} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("text-xs", TONE[event.type] ?? "text-slate-400")}>{ICON[event.type] ?? "•"}</span>
            <span className="text-xs text-slate-400">{event.label}</span>
            <span aria-hidden="true" className="font-mono text-[10px] text-slate-600">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
