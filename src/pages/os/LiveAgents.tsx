/**
 * LiveAgents.tsx — Real-time Agent Kanban board.
 *
 * Connects to the server's SSE stream and displays agents in columns by
 * their live status (idle, thinking, executing_tool, errored, quarantined).
 * Also supports spawning new sub-agents and viewing scheduler state.
 */
import { useState } from 'react';
import { useSSE, useAgentStates } from '../../lib/useSSE';
import { Badge, Button, Card, SectionTitle } from '../../components/ui';
import { AgentNodeGrid, type AgentNodeData } from '../../components/AgentNode';
import { remote as remoteApi } from '../../lib/remote';

const STATUS_META: Record<string, { label: string; icon: string }> = {
  idle: { label: 'Idle', icon: '⏸' },
  thinking: { label: 'Thinking', icon: '🧠' },
  executing_tool: { label: 'Executing', icon: '⚙' },
  errored: { label: 'Errored', icon: '⚠' },
  quarantined: { label: 'Quarantined', icon: '🔒' },
  completed: { label: 'Completed', icon: '✓' },
};

const STATUS_BADGE: Record<
  string,
  { label: string; tone: 'emerald' | 'slate' | 'amber' | 'rose' }
> = {
  idle: { label: '○ Idle', tone: 'slate' },
  connecting: { label: '◌ Connecting', tone: 'amber' },
  connected: { label: '● Live', tone: 'emerald' },
  reconnecting: { label: '↻ Reconnecting', tone: 'amber' },
  failed: { label: '✕ Stream down', tone: 'rose' },
};

export default function LiveAgents() {
  const { events, status, connected } = useSSE();
  const agentStates = useAgentStates();
  const [spawning, setSpawning] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);

  const agents = Object.values(agentStates) as Array<{
    id?: string;
    name?: string;
    status?: string;
    currentTool?: string;
    ring?: number;
    kind?: string;
    llmModel?: string;
    tokensUsed?: number;
    tokenBudget?: number;
  }>;

  // Group by status for Kanban columns
  const columns = ['idle', 'thinking', 'executing_tool', 'errored', 'quarantined', 'completed'];
  const grouped: Record<string, typeof agents> = {};
  for (const col of columns) grouped[col] = agents.filter((a) => a.status === col);

  async function spawnAgent() {
    setSpawning(true);
    setSpawnError(null);
    try {
      await remoteApi.spawnAgent({
        name: `agent-${Date.now()}`,
        kind: 'sub-agent',
        ring: 2,
        scopes: ['memory:read', 'memory:write'],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSpawnError(
        /423|kill switch/i.test(msg)
          ? 'Spawn blocked: kill switch is engaged on the server.'
          : `Spawn failed: ${msg}`
      );
      console.error('spawn failed:', e);
    }
    setSpawning(false);
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Live Agent Board"
        subtitle="Real-time multi-agent orchestration via SSE"
        action={
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_BADGE[status.state]?.tone ?? 'slate'}>
              {STATUS_BADGE[status.state]?.label ?? status.state}
              {status.state === 'reconnecting' && status.nextRetryAt > Date.now() && (
                <span className="ml-1 opacity-70">
                  ({Math.ceil((status.nextRetryAt - Date.now()) / 1000)}s)
                </span>
              )}
              {status.state === 'reconnecting' && status.retryAttempt > 1 && (
                <span className="ml-1 opacity-70">· try {status.retryAttempt}</span>
              )}
            </Badge>
            <Button variant="primary" onClick={spawnAgent} disabled={spawning || !connected}>
              + Spawn Agent
            </Button>
          </div>
        }
      />

      {status.state === 'failed' && (
        <Card className="border-rose-500/30 p-4">
          <p className="text-sm text-rose-300">
            Live stream failed after {status.retryAttempt} retries
            {status.lastError ? ` (${status.lastError})` : ''}. The dashboard keeps working on
            cached data. Reconnecting when the server returns, or re-open Settings → Remote.
          </p>
        </Card>
      )}

      {status.state === 'idle' && (
        <Card className="border-amber-500/30 p-4">
          <p className="text-sm text-amber-300">
            SSE is not connected. Enable a remote server in Settings → Remote to see live agent
            activity. The server must be running at the configured URL.
          </p>
        </Card>
      )}

      {spawnError && (
        <Card className="border-rose-500/30 p-4">
          <p className="text-sm text-rose-300">{spawnError}</p>
        </Card>
      )}

      {/* Event stream */}
      {events.length > 0 && (
        <Card className="p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">
            Recent Events ({events.length})
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {events
              .slice(-15)
              .reverse()
              .map((e, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 font-mono text-[10px] text-slate-500"
                >
                  <span className="text-cyan-400">{e.type}</span>
                  <span className="truncate">{JSON.stringify(e.data).slice(0, 80)}</span>
                  <span className="ml-auto">{new Date(e.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Orbiting Agent Nodes (futuristic HUD) */}
      <AgentNodeGrid agents={agents as AgentNodeData[]} />

      {/* Status summary */}
      <div className="flex flex-wrap gap-2">
        {columns.map((col) => {
          const meta = STATUS_META[col] ?? STATUS_META.idle;
          const count = (grouped[col] ?? []).length;
          if (count === 0) return null;
          return (
            <Badge
              key={col}
              tone={
                col === 'errored' || col === 'quarantined'
                  ? 'rose'
                  : col === 'completed'
                    ? 'emerald'
                    : 'slate'
              }
            >
              {meta.icon} {meta.label}: {count}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
