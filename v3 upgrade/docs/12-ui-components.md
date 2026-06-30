# 12 — Futuristic UI Components
## NEXUS V3 — AgentNode, AgentDrawer, EventTicker, HoldToConfirm

> **Complete React 19 + Tailwind 4 components for the futuristic HUD.**
> Copy each file to `src/components/`.

---

## CSS Animations (add to `src/index.css`)

```css
@keyframes nexus-spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes nexus-glitch {
  0%, 100% { transform: translate(0); filter: hue-rotate(0deg); }
  20% { transform: translate(-1px, 1px); filter: hue-rotate(90deg); }
  40% { transform: translate(1px, -1px); filter: hue-rotate(180deg); }
  60% { transform: translate(-1px, -1px); filter: hue-rotate(270deg); }
  80% { transform: translate(1px, 1px); filter: hue-rotate(360deg); }
}
@keyframes nexus-ticker {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}
.nexus-spin-slow { animation: nexus-spin-slow 3s linear infinite; }
.nexus-glitch { animation: nexus-glitch 0.3s steps(2) infinite; }
.nexus-ticker { animation: nexus-ticker 30s linear infinite; }
.glass { background: rgba(255,255,255,0.03); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.06); }
.glass-active { background: rgba(6,182,212,0.05); backdrop-filter: blur(12px); border: 1px solid rgba(6,182,212,0.2); box-shadow: 0 0 20px rgba(6,182,212,0.1); }
```

---

## AgentNode.tsx — Orbiting Agent Visualization

```typescript
// src/components/AgentNode.tsx
import { cn } from "./ui";

export type AgentStatus = "idle" | "thinking" | "executing_tool" | "errored" | "quarantined" | "completed";

export interface AgentNodeData {
  id: string; name: string; status: AgentStatus; ring?: number;
  kind?: string; currentTool?: string; llmModel?: string;
  tokensUsed?: number; tokenBudget?: number;
}

const STATUS_CONFIG: Record<AgentStatus, { label: string; dot: string; glow: string; ring: string; icon: string; animation?: string }> = {
  idle: { label: "Idle", dot: "bg-slate-600", glow: "", ring: "border-slate-700/50", icon: "○" },
  thinking: { label: "Thinking", dot: "bg-cyan-400", glow: "shadow-[0_0_20px_rgba(6,182,212,0.5)]", ring: "border-cyan-500/40", icon: "🧠", animation: "nexus-pulse" },
  executing_tool: { label: "Executing", dot: "bg-amber-400", glow: "shadow-[0_0_15px_rgba(251,191,36,0.4)]", ring: "border-amber-500/50", icon: "⚙", animation: "nexus-spin-slow" },
  errored: { label: "Error", dot: "bg-rose-500", glow: "shadow-[0_0_20px_rgba(244,63,94,0.6)]", ring: "border-rose-500/60", icon: "⚠", animation: "nexus-glitch" },
  quarantined: { label: "Quarantined", dot: "bg-rose-900", glow: "shadow-[0_0_8px_rgba(136,19,55,0.4)]", ring: "border-rose-900/60", icon: "🔒" },
  completed: { label: "Done", dot: "bg-emerald-400", glow: "", ring: "border-emerald-500/30", icon: "✓" },
};

const RING_LABELS: Record<number, string> = { 0: "KERNEL", 1: "TRUSTED", 2: "MCP", 3: "REMOTE", 4: "QUARANTINE" };

export function AgentNode({ agent, onClick }: { agent: AgentNodeData; onClick?: () => void }) {
  const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.idle;
  return (
    <button onClick={onClick} className={cn("group relative flex w-48 flex-col items-center gap-2 rounded-xl border bg-white/[0.03] p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.06]", cfg.ring, cfg.glow, cfg.animation)}>
      <div className="relative flex h-12 w-12 items-center justify-center">
        <div className={cn("absolute inset-0 rounded-full border-2 transition-all", agent.status === "thinking" && "border-cyan-400/60 animate-ping", agent.status === "executing_tool" && "border-amber-400/50", agent.status === "errored" && "border-rose-500/70")} />
        <div className={cn("relative flex h-10 w-10 items-center justify-center rounded-full border bg-slate-950/80 text-lg", cfg.ring)}>{cfg.icon}</div>
      </div>
      <div className="text-center">
        <div className="truncate text-xs font-medium text-slate-200">{agent.name}</div>
        <div className="mt-0.5 flex items-center justify-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
          <span className="text-[10px] text-slate-500">{cfg.label}</span>
        </div>
      </div>
      {agent.ring !== undefined && (
        <span className="absolute -right-1.5 -top-1.5 rounded-md border border-white/10 bg-slate-950 px-1.5 py-0.5 font-mono text-[8px] tracking-wider text-slate-500">R{agent.ring} · {RING_LABELS[agent.ring] ?? "—"}</span>
      )}
      {agent.currentTool && <div className="w-full truncate rounded bg-amber-500/5 px-2 py-0.5 text-center font-mono text-[9px] text-amber-300/80">⚙ {agent.currentTool}</div>}
      {agent.tokensUsed !== undefined && agent.tokenBudget !== undefined && agent.tokensUsed > 0 && (
        <div className="w-full">
          <div className="h-0.5 overflow-hidden rounded-full bg-slate-800">
            <div className={cn("h-full rounded-full transition-all", agent.tokensUsed / agent.tokenBudget > 0.8 ? "bg-rose-400" : "bg-cyan-400/60")} style={{ width: `${Math.min(100, (agent.tokensUsed / agent.tokenBudget) * 100)}%` }} />
          </div>
          <div className="mt-0.5 text-center font-mono text-[8px] text-slate-700">{(agent.tokensUsed / 1000).toFixed(1)}k / {(agent.tokenBudget / 1000).toFixed(0)}k</div>
        </div>
      )}
    </button>
  );
}

export function AgentNodeGrid({ agents, onSelect }: { agents: AgentNodeData[]; onSelect?: (a: AgentNodeData) => void }) {
  if (!agents.length) return <div className="flex flex-col items-center py-12 text-center"><div className="text-3xl opacity-20">◌</div><p className="mt-2 text-sm text-slate-600">No agents active</p></div>;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{agents.map((a) => <AgentNode key={a.id} agent={a} onClick={() => onSelect?.(a)} />)}</div>;
}
```

---

## AgentDrawer.tsx — Click-to-Inspect Control Room

```typescript
// src/components/AgentDrawer.tsx
import { useEffect, useState } from "react";
import { Badge, Button, Card, cn } from "./ui";
import type { AgentNodeData } from "./AgentNode";

export function AgentDrawer({ agent, onClose }: { agent: AgentNodeData | null; onClose: () => void }) {
  const [activity, setActivity] = useState<string[]>([]);
  useEffect(() => {
    if (!agent) return;
    setActivity((p) => [`[${new Date().toLocaleTimeString()}] ${agent.status}: ${agent.currentTool ?? "idle"}`, ...p.slice(0, 50)]);
  }, [agent?.status, agent?.currentTool]);
  if (!agent) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 h-full w-96 overflow-y-auto border-l border-cyan-500/20 bg-nexus-panel/95 backdrop-blur-xl nexus-fade">
        <div className="sticky top-0 border-b border-nexus-border bg-nexus-panel/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">{agent.name}</h2>
              <div className="mt-1 flex items-center gap-2">
                <Badge tone="cyan">R{agent.ring}</Badge>
                <Badge tone="slate">{agent.kind ?? "agent"}</Badge>
                <span className="font-mono text-[10px] text-slate-600">{agent.llmModel ?? "no-model"}</span>
              </div>
            </div>
            <button onClick={onClose} className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">✕</button>
          </div>
        </div>
        <div className="space-y-4 p-5">
          {agent.tokenBudget && (
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Token Budget</div>
              <div className="mt-2 flex items-center gap-3">
                <div className="relative h-16 w-16">
                  <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="rgb(30,41,59)" strokeWidth="6" />
                    <circle cx="32" cy="32" r="28" fill="none" stroke="rgb(34,211,238)" strokeWidth="6" strokeDasharray={`${2 * Math.PI * 28}`} strokeDashoffset={`${2 * Math.PI * 28 * (1 - (agent.tokensUsed ?? 0) / agent.tokenBudget)}`} className="transition-all duration-500" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center"><span className="font-mono text-[10px] text-cyan-300">{Math.round(((agent.tokensUsed ?? 0) / agent.tokenBudget) * 100)}%</span></div>
                </div>
                <div className="flex-1">
                  <div className="font-mono text-xs text-slate-300">{(agent.tokensUsed ?? 0).toLocaleString()} / {agent.tokenBudget.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-600">tokens consumed</div>
                </div>
              </div>
            </Card>
          )}
          <Card className="overflow-hidden">
            <div className="border-b border-nexus-border px-3 py-2"><span className="text-[10px] uppercase tracking-wider text-slate-500">Activity Log</span></div>
            <div className="h-48 overflow-y-auto bg-slate-950/80 p-3 font-mono text-[10px] leading-relaxed">
              {activity.length === 0 ? <div className="text-slate-700">No activity yet</div> : activity.map((l, i) => <div key={i} className={cn("nexus-fade", l.includes("error") ? "text-rose-400" : "text-slate-400")}>{l}</div>)}
            </div>
          </Card>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1">⏸ Pause</Button>
            <Button variant="outline" size="sm" className="flex-1">▶ Resume</Button>
            <Button variant="danger" size="sm" className="flex-1">🔒 Kill</Button>
          </div>
        </div>
      </div>
    </>
  );
}
```

---

## EventTicker.tsx — Live Scrolling Events

```typescript
// src/components/EventTicker.tsx
import { useSSE } from "../lib/useSSE";

export function EventTicker() {
  const { events, connected } = useSSE();
  const recent = events.slice(-20).reverse();
  if (!connected || !recent.length) return null;

  const text = recent.map((e) => {
    const p = e.type === "agent.state" ? "AGT" : e.type === "task.update" ? "TSK" : e.type === "approval.requested" ? "HITL" : "SYS";
    const d = typeof e.data === "object" && e.data ? JSON.stringify(e.data).slice(0, 60) : String(e.data).slice(0, 60);
    return `[${p}] ${d}`;
  }).join("  ◆  ");

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-cyan-500/20 bg-slate-950/80 py-1 backdrop-blur-md">
      <div className="overflow-hidden whitespace-nowrap">
        <div className="nexus-ticker inline-block font-mono text-[10px] text-cyan-400/70">{text}  ◆  {text}</div>
      </div>
    </div>
  );
}
```

---

## HoldToConfirm.tsx — HITL Approval Button

```typescript
// src/components/HoldToConfirm.tsx
import { useState, useRef, useCallback } from "react";
import { cn } from "./ui";

export function HoldToConfirm({ onConfirm, label = "Hold to Approve", holdMs = 2000, variant = "approve" }: {
  onConfirm: () => void; label?: string; holdMs?: number; variant?: "approve" | "deny";
}) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startRef = useRef(0);

  const start = useCallback(() => {
    setHolding(true); startRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - startRef.current) / holdMs) * 100);
      setProgress(pct);
      if (pct >= 100) { stop(); onConfirm(); }
    }, 30);
  }, [holdMs, onConfirm]);

  const stop = useCallback(() => {
    setHolding(false); setProgress(0);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  return (
    <button onMouseDown={start} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchEnd={stop}
      className={cn("relative overflow-hidden rounded-lg border px-6 py-3 text-sm font-medium transition-colors",
        variant === "approve" ? "border-emerald-500/40 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30" : "border-rose-500/40 bg-rose-600/20 text-rose-300 hover:bg-rose-600/30")}>
      <div className={cn("absolute inset-0 transition-all duration-30", variant === "approve" ? "bg-emerald-500/40" : "bg-rose-500/40")} style={{ width: `${progress}%` }} />
      <span className="relative z-10">{holding ? `Hold... ${Math.round(progress)}%` : label}</span>
    </button>
  );
}
```

---

## Loading/Empty/Error States (add to ui.tsx)

```typescript
// Add to src/components/ui.tsx:

export function SkeletonLoader({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl border border-nexus-border bg-nexus-panel/30" />)}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Card className="border-rose-500/30 p-6"><div className="flex flex-col items-center text-center"><div className="mb-2 text-2xl">⚠</div><p className="text-sm text-rose-300">{message}</p>{onRetry && <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Retry</Button>}</div></Card>;
}

export function AsyncEmptyState({ title, hint }: { title: string; hint?: string }) {
  return <Card className="p-8"><div className="flex flex-col items-center text-center"><div className="mb-2 text-2xl opacity-30">◌</div><p className="text-sm text-slate-400">{title}</p>{hint && <p className="mt-1 text-xs text-slate-600">{hint}</p>}</div></Card>;
}
```

---

## Success Checklist

```
[ ] AgentNode renders with status-based glow/animation
[ ] AgentNode shows ring badge, token bar, current tool
[ ] AgentDrawer slides in on click, shows activity log
[ ] EventTicker scrolls at bottom of screen
[ ] HoldToConfirm fills progress over 2 seconds
[ ] SkeletonLoader shows pulse animation
[ ] ErrorState shows message + retry button
[ ] AsyncEmptyState shows helpful empty message
[ ] All components use glassmorphism (backdrop-blur, semi-transparent)
[ ] All components have hover effects (-translate-y-0.5)
```
