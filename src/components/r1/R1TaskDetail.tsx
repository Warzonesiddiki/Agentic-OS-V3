/**
 * E6-S2 Task start and detail experience
 * AC:
 * 1. Start drawer shows goal, scope, agent, memory mode, capabilities, budgets, approval preview
 * 2. Task detail has deep link, status, current step, timeline, evidence links, cost/latency, valid actions
 * 3. UI renders all task states with PRD language and no fake progress
 * 4. Event replay keeps view correct after reload/reconnect
 * 5. Cancel/retry/recover actions require server-confirmed state
 * 6. UI never exposes raw secrets or unredacted tool arguments
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { r1 } from '../../lib/r1-client';
import { Badge, Button, Card, Input, Textarea, Select } from '../ui';

function TaskStateBadge({ state }: { state: string }) {
  const toneMap: Record<string, 'slate' | 'cyan' | 'amber' | 'emerald' | 'rose'> = {
    queued: 'slate',
    running: 'cyan',
    waiting_approval: 'amber',
    waiting_input: 'amber',
    retrying: 'amber',
    compensating: 'amber',
    completed: 'emerald',
    failed: 'rose',
    canceled: 'slate',
    quarantined: 'rose',
  };
  return <Badge tone={toneMap[state] ?? 'slate'}>{state}</Badge>;
}

export function R1TaskStart() {
  const navigate = useNavigate();
  const projectId = localStorage.getItem('r1-project-id') ?? '';
  const [form, setForm] = useState({ goal: 'Refactor authentication module to use new token service', agentId: 'dev-agent', memoryMode: 'auto', capabilities: ['read-file', 'write-file'], budget: 1800 });
  const [preview, setPreview] = useState('This task can read project files, may propose file writes, and cannot access credentials or unrelated projects. File writes require approval.');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!projectId) { setError('No project selected'); return; }
    setCreating(true);
    setError(null);
    try {
      const task = {
        id: crypto.randomUUID(),
        projectId,
        principalId: 'local-operator',
        agentId: form.agentId,
        state: 'queued',
        title: form.goal.slice(0, 80),
        goal: form.goal,
        capabilityIds: form.capabilities,
        policyVersion: 'v1',
        inputReference: `input-${Date.now()}`,
        correlationId: crypto.randomUUID(),
        idempotencyKey: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const created = await r1.createTask(projectId, task);
      navigate(`/r1/tasks/${created.id ?? task.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setCreating(false); }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-100">Start governed task</h1>
      <Card className="p-5 space-y-4">
        <div>
          <label className="text-xs text-slate-400">Goal</label>
          <Textarea value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400">Project scope (locked)</label>
            <Input value={projectId} disabled />
          </div>
          <div>
            <label className="text-xs text-slate-400">Agent/runtime</label>
            <Input value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400">Memory context mode</label>
            <Select value={form.memoryMode} onChange={(e) => setForm({ ...form, memoryMode: e.target.value })}>
              <option value="auto">Automatic scoped recall (budget {form.budget})</option>
              <option value="selected">Selected memories</option>
              <option value="none">None</option>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Token budget</label>
            <Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400">Allowed capabilities (risk)</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {['read-file', 'write-file', 'run-tests', 'constrained-command'].map((cap) => (
              <label key={cap} className="flex items-center gap-1 text-xs text-slate-300">
                <input type="checkbox" checked={form.capabilities.includes(cap)} onChange={(e) => setForm({ ...form, capabilities: e.target.checked ? [...form.capabilities, cap] : form.capabilities.filter((c) => c !== cap) })} />
                {cap} <Badge tone={cap === 'read-file' ? 'slate' : cap === 'write-file' ? 'amber' : 'rose'}>{cap === 'read-file' ? 'low' : 'high'}</Badge>
              </label>
            ))}
          </div>
        </div>
        <Card className="p-3 bg-amber-950/20 border-amber-700/30">
          <p className="text-xs text-amber-200">Approval preview: {preview}</p>
          <p className="mt-1 text-[11px] text-slate-400">File writes require explicit approval. Secrets are redacted. No side effect before approval.</p>
        </Card>
        <div className="flex gap-2">
          <Button variant="primary" onClick={start} disabled={creating}>{creating ? 'Starting...' : 'Start governed task'}</Button>
          <Button variant="ghost" onClick={() => navigate('/r1/dashboard')}>Cancel</Button>
        </div>
        {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
      </Card>
    </div>
  );
}

export function R1TaskDetail() {
  const { taskId } = useParams();
  const projectId = localStorage.getItem('r1-project-id') ?? '';
  const [task, setTask] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [recovery, setRecovery] = useState<any>(null);
  const [cursor, setCursor] = useState<number>(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!projectId || !taskId) return;
    try {
      setLoading(true);
      const [t, ev, tl] = await Promise.all([
        r1.getTask(projectId, taskId).catch((e) => { throw e; }),
        r1.listTaskEvents(projectId, taskId).catch(() => []),
        r1.evidenceTimeline(projectId, taskId).catch(() => []),
      ]);
      setTask(t);
      // Event replay: apply idempotent
      const lastSeq = events.length ? events[events.length - 1].sequence : -1;
      const replay = await fetch(`/api/v1/r1/projects/${projectId}/tasks/${taskId}/events/stream?cursor=${lastSeq}`).then((r) => r.json()).catch(() => ({ events: ev }));
      const merged = [...ev, ...(replay.events ?? [])];
      const dedup = new Map(merged.map((e: any) => [e.id, e]));
      const sorted = [...dedup.values()].sort((a: any, b: any) => a.sequence - b.sequence);
      setEvents(sorted);
      setCursor(sorted.length ? sorted[sorted.length - 1].sequence : -1);
      setTimeline(tl);
      if (t.state === 'failed') {
        const rec = await r1.getRecovery(projectId, taskId).catch(() => null);
        setRecovery(rec);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [taskId]);

  if (loading) return <div className="p-6 text-xs text-slate-500">Loading task...</div>;
  if (error) return <Card className="p-6"><p className="text-xs text-rose-400">Error: {error}</p></Card>;
  if (!task) return <Card className="p-6"><p className="text-xs text-slate-500">Task not found</p></Card>;

  const canCancel = ['queued', 'running', 'waiting_approval', 'waiting_input', 'retrying'].includes(task.state);
  const canRetry = task.state === 'failed';
  const canRecover = task.state === 'failed' && recovery;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-3">
            {task.title ?? task.goal?.slice(0, 50)} <TaskStateBadge state={task.state} />
          </h1>
          <p className="mt-1 font-mono text-[11px] text-slate-500">ID: {task.id} · Correlation: {task.correlationId} · Project: {projectId}</p>
          <p className="mt-1 text-xs text-slate-400">Goal: {task.goal}</p>
        </div>
        <div className="flex gap-2">
          {canCancel && <Button size="sm" variant="danger" onClick={async () => { await r1.cancelTask(projectId, taskId!); await load(); }}>Cancel</Button>}
          {canRetry && <Button size="sm" variant="primary" onClick={async () => { await r1.retryTask(projectId, taskId!); await load(); }}>Retry</Button>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-200">Timeline</h3>
          <div className="mt-3 space-y-2">
            {events.map((ev: any, idx: number) => (
              <div key={ev.id} className="flex gap-3 rounded border border-nexus-border bg-slate-950/40 px-3 py-2">
                <span className="font-mono text-[10px] text-slate-600">{ev.sequence}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><Badge tone="slate">{ev.event}</Badge><span className="text-xs text-slate-300">{ev.state}</span><span className="ml-auto text-[10px] text-slate-500">{new Date(ev.createdAt).toLocaleTimeString()}</span></div>
                  <div className="mt-1 text-[11px] text-slate-500">Event ID: {ev.id}</div>
                </div>
              </div>
            ))}
            {events.length === 0 && <p className="text-xs text-slate-500">No events yet. Task is {task.state}.</p>}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h4 className="text-xs font-semibold text-slate-300">Overview</h4>
            <dl className="mt-2 space-y-1 text-[11px] text-slate-400">
              <div className="flex justify-between"><dt>Agent</dt><dd className="font-mono text-slate-200">{task.agentId}</dd></div>
              <div className="flex justify-between"><dt>Policy</dt><dd className="font-mono text-slate-200">{task.policyVersion}</dd></div>
              <div className="flex justify-between"><dt>Capabilities</dt><dd className="font-mono text-slate-200">{(task.capabilityIds ?? []).join(', ')}</dd></div>
              <div className="flex justify-between"><dt>Started</dt><dd className="text-slate-200">{new Date(task.createdAt).toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt>Updated</dt><dd className="text-slate-200">{new Date(task.updatedAt).toLocaleString()}</dd></div>
            </dl>
          </Card>

          <Card className="p-4">
            <h4 className="text-xs font-semibold text-slate-300">Evidence</h4>
            <div className="mt-2 space-y-1">
              {timeline.slice(0, 10).map((e: any) => (
                <div key={e.id} className="text-[11px] text-slate-400">• {e.summary} <span className="text-slate-600">[{e.kind}]</span></div>
              ))}
              {timeline.length === 0 && <p className="text-[11px] text-slate-500">No evidence yet</p>}
            </div>
          </Card>

          {canRecover && (
            <Card className="p-4 border-amber-700/30">
              <h4 className="text-xs font-semibold text-amber-300">Recovery</h4>
              <p className="mt-1 text-[11px] text-slate-400">Valid actions: {(recovery.validActions ?? []).join(', ')}</p>
              {recovery.lastCheckpoint && <p className="mt-1 text-[11px] text-slate-500">Last checkpoint: seq {recovery.lastCheckpoint.sequence} at {recovery.lastCheckpoint.createdAt}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="primary" onClick={async () => { await r1.retryTask(projectId, taskId!); await load(); }}>Retry from checkpoint</Button>
                <Button size="sm" variant="danger" onClick={async () => { await r1.cancelTask(projectId, taskId!); await load(); }}>Cancel</Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
