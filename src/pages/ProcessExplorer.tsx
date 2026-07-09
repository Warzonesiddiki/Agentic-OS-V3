import { useState, useEffect, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { remote as remoteApi, getRemote } from "../lib/remote";
import { Badge, Button, Card, SectionTitle, Input, Select, cn, EmptyState } from "../components/ui";
import { formatDateTime } from "../lib/core";

/* ── Types ─────────────────────────────────────────────────────────── */

type AgentHealth = "healthy" | "degraded" | "failed" | "quarantined";
type AgentStatus = "active" | "paused" | "idle" | "quarantined" | "failed" | "degraded";

interface AgentProcess {
  id: string;
  name: string;
  status: AgentStatus;
  type: string;
  ring: number;
  parentId: string | null;
  cpu: number;
  memory: number;
  taskQueueDepth: number;
  health: AgentHealth;
  logs: string[];
  llmModel?: string;
  currentTool?: string;
  tokensUsed?: number;
  tokenBudget?: number;
  children: AgentProcess[];
  createdAt: number;
}

/* ── Visual config ─────────────────────────────────────────────────── */

const HEALTH_META: Record<AgentHealth, { label: string; dot: string; badge: "emerald" | "amber" | "rose" }> = {
  healthy: { label: "Healthy", dot: "bg-emerald-400", badge: "emerald" },
  degraded: { label: "Degraded", dot: "bg-amber-400", badge: "amber" },
  failed: { label: "Failed", dot: "bg-rose-500", badge: "rose" },
  quarantined: { label: "Quarantined", dot: "bg-rose-900", badge: "rose" },
};

const STATUS_META: Record<AgentStatus, { label: string; dot: string; badge: "emerald" | "amber" | "rose" | "slate" }> = {
  active: { label: "Active", dot: "bg-emerald-400", badge: "emerald" },
  paused: { label: "Paused", dot: "bg-amber-400", badge: "amber" },
  idle: { label: "Idle", dot: "bg-slate-500", badge: "slate" },
  quarantined: { label: "Quarantined", dot: "bg-rose-900", badge: "rose" },
  failed: { label: "Failed", dot: "bg-rose-500", badge: "rose" },
  degraded: { label: "Degraded", dot: "bg-amber-400", badge: "amber" },
};

const RING_LABELS: Record<number, string> = {
  0: "Kernel",
  1: "Trusted",
  2: "MCP",
  3: "Remote",
  4: "Quarantine",
};

/* ── Helpers ───────────────────────────────────────────────────────── */

function buildTree(agents: AgentProcess[]): AgentProcess[] {
  const map = new Map<string, AgentProcess>();
  const roots: AgentProcess[] = [];
  for (const a of agents) {
    map.set(a.id, { ...a, children: [] });
  }
  for (const a of agents) {
    const node = map.get(a.id)!;
    if (a.parentId && map.has(a.parentId)) {
      map.get(a.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function countDescendants(node: AgentProcess): number {
  let count = node.children.length;
  for (const c of node.children) count += countDescendants(c);
  return count;
}

/* ── Tree Node ─────────────────────────────────────────────────────── */

function TreeNode({
  node,
  depth,
  onPause,
  onResume,
  onKill,
  onViewLogs,
  selectedId,
}: {
  node: AgentProcess;
  depth: number;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onKill: (id: string) => void;
  onViewLogs: (id: string) => void;
  selectedId: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const health = HEALTH_META[node.health];
  const status = STATUS_META[node.status];
  const descendantCount = countDescendants(node);

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-all",
          selectedId === node.id
            ? "border-cyan-500/50 bg-cyan-500/10"
            : "border-transparent hover:border-nexus-border hover:bg-slate-900/60",
        )}
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        {/* Expand / collapse */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] text-slate-600 transition-colors hover:text-slate-300",
            !hasChildren && "invisible",
          )}
        >
          {expanded ? "▾" : "▸"}
        </button>

        {/* Health dot */}
        <span className={cn("h-2 w-2 shrink-0 rounded-full", health.dot)} title={health.label} />

        {/* Name + meta */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate font-medium text-slate-100">{node.name}</span>
          <span className="hidden shrink-0 font-mono text-[10px] text-slate-600 sm:inline">{node.type}</span>
          <Badge tone={status.badge}>{status.label}</Badge>
          {node.ring !== undefined && (
            <span className="hidden shrink-0 rounded border border-white/5 bg-slate-900 px-1.5 py-0.5 font-mono text-[9px] text-slate-600 lg:inline">
              R{node.ring} · {RING_LABELS[node.ring] ?? "—"}
            </span>
          )}
          {hasChildren && (
            <span className="shrink-0 font-mono text-[9px] text-slate-600">{descendantCount} sub{descendantCount === 1 ? "" : "s"}</span>
          )}
        </div>

        {/* Current tool */}
        {node.currentTool && (
          <span className="hidden max-w-[120px] truncate rounded bg-amber-500/5 px-1.5 py-0.5 font-mono text-[9px] text-amber-300/80 xl:inline">
            ⚙ {node.currentTool}
          </span>
        )}

        {/* Resource bars */}
        <div className="hidden items-center gap-3 lg:flex">
          <ResBar value={node.cpu} label="CPU" className="w-14" />
          <ResBar value={node.memory} label="MEM" className="w-14" />
          <ResBar value={node.taskQueueDepth} label="Q" max={10} className="w-10" />
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
          {node.status === "active" && (
            <ActionBtn title="Pause" onClick={() => onPause(node.id)}>⏸</ActionBtn>
          )}
          {node.status === "paused" && (
            <ActionBtn title="Resume" onClick={() => onResume(node.id)}>▶</ActionBtn>
          )}
          {(node.status === "active" || node.status === "paused" || node.status === "degraded") && (
            <ActionBtn title="Kill" onClick={() => onKill(node.id)} className="hover:bg-rose-500/20 hover:text-rose-300">✕</ActionBtn>
          )}
          <ActionBtn title="View Logs" onClick={() => onViewLogs(node.id)}>📋</ActionBtn>
        </div>
      </div>

      {/* Children */}
      <AnimatePresence initial={false}>
        {expanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                onPause={onPause}
                onResume={onResume}
                onKill={onKill}
                onViewLogs={onViewLogs}
                selectedId={selectedId}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ResBar({ value, label, max = 100, className }: { value: number; label: string; max?: number; className?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const color =
    pct > 80 ? "bg-rose-400" : pct > 50 ? "bg-amber-400" : "bg-cyan-400/60";
  return (
    <div className={cn("flex items-center gap-1.5", className)} title={`${label}: ${value.toFixed(1)}`}>
      <span className="font-mono text-[8px] uppercase tracking-wider text-slate-600">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  title,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  className?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded text-[11px] text-slate-500 transition-colors hover:bg-slate-700/60 hover:text-slate-200",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ── Log Panel ─────────────────────────────────────────────────────── */

function LogPanel({
  agent,
  onClose,
}: {
  agent: AgentProcess | null;
  onClose: () => void;
}) {
  if (!agent) return null;

  return (
    <motion.div
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex h-full w-80 shrink-0 flex-col border-l border-nexus-border bg-slate-950/80 backdrop-blur-md"
    >
      <div className="flex items-center justify-between border-b border-nexus-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", HEALTH_META[agent.health].dot)} />
          <span className="truncate text-sm font-medium text-slate-100">{agent.name}</span>
        </div>
        <button onClick={onClose} className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {agent.logs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-600">No logs yet.</div>
        ) : (
          <div className="space-y-1">
            {agent.logs.map((log, i) => (
              <div key={i} className="font-mono text-[10px] leading-relaxed text-slate-400">
                <span className="text-slate-600">[{formatDateTime(Date.now() - (agent.logs.length - i) * 1000)}]</span> {log}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-nexus-border px-4 py-2">
        <div className="flex items-center gap-2 text-[10px] text-slate-600">
          <span>CPU: {agent.cpu.toFixed(1)}%</span>
          <span>·</span>
          <span>MEM: {(agent.memory * 100).toFixed(0)}%</span>
          <span>·</span>
          <span>Queue: {agent.taskQueueDepth}</span>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main component ────────────────────────────────────────────────── */

export default function ProcessExplorer() {
  const remote = getRemote();
  const [agents, setAgents] = useState<AgentProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [ringFilter, setRingFilter] = useState<string>("all");

  // Selected agent for log panel
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedId) ?? null,
    [agents, selectedId],
  );

  /* ── Fetch agents ── */

  const fetchAgents = useCallback(async () => {
    if (!remote.enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await remoteApi.call<{ agents: AgentProcess[] }>("/api/v3/agents");
      setAgents(data?.agents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch agents");
    }
    setLoading(false);
  }, [remote.enabled]);

  useEffect(() => {
    if (remote.enabled) {
      fetchAgents();
      const interval = setInterval(fetchAgents, 5000);
      return () => clearInterval(interval);
    }
  }, [remote.enabled, fetchAgents]);

  /* ── Actions ── */

  async function handlePause(id: string) {
    try {
      await remoteApi.call(`/api/v3/agents/${id}/pause`, { method: "POST" });
      fetchAgents();
    } catch (e) {
      console.error("pause failed:", e);
    }
  }

  async function handleResume(id: string) {
    try {
      await remoteApi.call(`/api/v3/agents/${id}/resume`, { method: "POST" });
      fetchAgents();
    } catch (e) {
      console.error("resume failed:", e);
    }
  }

  async function handleKill(id: string) {
    try {
      await remoteApi.call(`/api/v3/agents/${id}/kill`, { method: "POST" });
      fetchAgents();
    } catch (e) {
      console.error("kill failed:", e);
    }
  }

  /* ── Filtering ── */

  const filtered = useMemo(() => {
    let list = agents;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") list = list.filter((a) => a.status === statusFilter);
    if (typeFilter !== "all") list = list.filter((a) => a.type === typeFilter);
    if (ringFilter !== "all") list = list.filter((a) => a.ring === Number(ringFilter));
    return list;
  }, [agents, search, statusFilter, typeFilter, ringFilter]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  /* ── Derived stats ── */

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<AgentStatus, number>> = {};
    for (const a of agents) {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    }
    return counts;
  }, [agents]);

  const uniqueTypes = useMemo(() => [...new Set(agents.map((a) => a.type))], [agents]);
  const totalCpu = useMemo(() => agents.reduce((s, a) => s + a.cpu, 0), [agents]);
  const totalMem = useMemo(() => agents.reduce((s, a) => s + a.memory, 0), [agents]);

  /* ── Render ── */

  if (!remote.enabled) {
    return (
      <div className="space-y-5">
        <SectionTitle
          title="Process Explorer"
          subtitle="Agent process tree with live resource monitoring"
        />
        <Card className="border-amber-500/30 p-4">
          <p className="text-sm text-amber-300">
            Process Explorer requires a remote server connection. Enable it in Settings &rarr; Remote to see agent process trees.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-0">
      {/* Main panel */}
      <div className="flex min-w-0 flex-1 flex-col space-y-4 overflow-y-auto p-1 pr-4">
        <SectionTitle
          title="Process Explorer"
          subtitle="Agent process tree · live resource usage · lifecycle controls"
          action={
            <div className="flex items-center gap-2">
              <Badge tone={loading ? "amber" : "emerald"}>
                {loading ? "refreshing…" : `● ${agents.length} agents`}
              </Badge>
              <Button size="sm" variant="primary" onClick={fetchAgents} disabled={loading}>
                {loading ? "…" : "⟳"}
              </Button>
            </div>
          }
        />

        {/* Status summary */}
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(statusCounts).map(([status, count]) => {
            const meta = STATUS_META[status as AgentStatus] ?? STATUS_META.idle;
            return (
              <Badge key={status} tone={meta.badge}>
                <span className={cn("mr-1 h-1.5 w-1.5 rounded-full", meta.dot)} />
                {meta.label}: {count}
              </Badge>
            );
          })}
          <span className="text-[11px] text-slate-600">
            · CPU {totalCpu.toFixed(1)}% · MEM {(totalMem * 100).toFixed(0)}%
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search agents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48 text-xs"
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 w-28 text-xs"
          >
            <option value="all">All status</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 w-28 text-xs"
          >
            <option value="all">All types</option>
            {uniqueTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <Select
            value={ringFilter}
            onChange={(e) => setRingFilter(e.target.value)}
            className="h-8 w-28 text-xs"
          >
            <option value="all">All rings</option>
            {[0, 1, 2, 3, 4].map((r) => (
              <option key={r} value={String(r)}>Ring {r} · {RING_LABELS[r] ?? "—"}</option>
            ))}
          </Select>
          {agents.length !== filtered.length && (
            <span className="text-[11px] text-slate-500">
              ({filtered.length} of {agents.length})
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <Card className="border-rose-500/30 p-3">
            <p className="text-sm text-rose-300">Error: {error}</p>
          </Card>
        )}

        {/* Tree */}
        <Card className="overflow-hidden">
          {tree.length === 0 && !loading ? (
            <EmptyState title="No agents found" hint={search ? "Try adjusting your search or filters." : "Spawn an agent to see it here."} />
          ) : (
            <div className="divide-y divide-nexus-border/50">
              {tree.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  onPause={handlePause}
                  onResume={handleResume}
                  onKill={handleKill}
                  onViewLogs={(id) => setSelectedId(id)}
                  selectedId={selectedId}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Log panel */}
      <AnimatePresence>
        {selectedAgent && (
          <LogPanel agent={selectedAgent} onClose={() => setSelectedId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
