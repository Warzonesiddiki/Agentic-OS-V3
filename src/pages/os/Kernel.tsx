import { useState } from 'react';
import { useState, useEffect } from 'react';
import { os, useOS } from '../../osStore';
import { remote } from '../../lib/remote';
import { useOSRemote } from '../../lib/os/useOSRemote';
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  SectionTitle,
  Select,
  Stat,
  cn,
} from '../../components/ui';
import { RING_NAMES, type QueueId, type TaskKind } from '../../lib/os/types';
import { formatNumber, timeAgo } from '../../lib/core';

const RING_TONE = { 0: 'emerald', 1: 'cyan', 2: 'amber', 3: 'slate', 4: 'rose' } as const;

interface RingInfo {
  id: number;
  name?: string;
  tools?: string[];
  maxConcurrency?: number;
  members?: string[];
  tokenLimitPerMin?: number;
  apiLimitPerHour?: number;
}
interface WorkerHealth {
  pollLoops?: number;
  heartbeats?: number;
  staleTasks?: number;
  lastTickMs?: number;
  runningTasks?: number;
}
interface SchedLatency {
  p50Ms?: number;
  p95Ms?: number;
  p99Ms?: number;
  queueDepth?: number;
}
interface BackendKernel {
  rings: RingInfo[];
  ringPolicy?: { ringBudgets?: Record<string, unknown>; defaultPolicy?: string };
  workerHealth?: WorkerHealth;
  scheduler?: { policy?: string; dryRun?: boolean };
  latency?: SchedLatency;
  error?: string;
  loading?: boolean;
}

/**
 * Live introspection of the REAL backend kernel/scheduler (Target 2).
 * Pulls /api/kernel/state-machine, /api/kernel/ring-policy, /api/kernel/worker-health,
 * /api/scheduler/policy and /api/scheduler/latency. Degrades gracefully to a
 * friendly message when remote is OFF or the backend routes are not mounted.
 */
function useBackendKernel(): BackendKernel {
  const [state, setState] = useState<BackendKernel>({ rings: [], loading: true });
  const remoteOS = useOSRemote();
  const enabled = remoteOS.dataSource === 'remote';

  useEffect(() => {
    let alive = true;
    if (!enabled) {
      setState({ rings: [], loading: false });
      return;
    }
    const load = async () => {
      try {
        const [kernel, policy, health, sched, lat] = await Promise.all([
          remote.kernelState().catch(() => null),
          remote.ringPolicy().catch(() => null),
          remote.workerHealth().catch(() => null),
          remote.schedulerPolicy().catch(() => null),
          remote.schedulerLatency().catch(() => null),
        ]);
        if (!alive) return;
        const k = (kernel as { rings?: RingInfo[] }) ?? {};
        const sch = (sched as { policy?: string; dryRun?: boolean }) ?? {};
        setState({
          rings: k.rings ?? [],
          ringPolicy: policy as BackendKernel['ringPolicy'],
          workerHealth: health as WorkerHealth,
          scheduler: { policy: sch.policy, dryRun: sch.dryRun },
          latency: lat as SchedLatency,
          loading: false,
        });
      } catch (e) {
        if (!alive) return;
        setState({ rings: [], loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);

  return state;
}

function BackendKernelPanel() {
  const bk = useBackendKernel();
  if (!bk.loading && bk.rings.length === 0 && !bk.error) {
    return (
      <Card className="p-4 border-slate-700/40">
        <SectionTitle
          title="Live backend kernel"
          subtitle="Rings · MLFQ · runtime-loop (real kernel)"
        />
        <p className="mt-3 text-xs text-slate-500">
          Enable a remote server (Settings → Remote) to stream live kernel introspection. When
          remote is OFF this view is intentionally empty — the simulator above is authoritative for
          local mode.
        </p>
      </Card>
    );
  }
  return (
    <Card className="p-4">
      <SectionTitle
        title="Live backend kernel"
        subtitle="Rings · MLFQ · runtime-loop (real kernel)"
      />
      {bk.error && (
        <p className="mt-2 text-xs text-rose-300">Introspection unavailable: {bk.error}</p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {bk.rings.map((r) => {
          const tone = RING_TONE[r.id as 0 | 1 | 2 | 3 | 4] ?? 'slate';
          return (
            <div key={r.id} className="rounded-lg border border-nexus-border bg-slate-950/40 p-3">
              <div className="flex items-center gap-2">
                <Badge tone={tone}>ring {r.id}</Badge>
                <span className="text-xs text-slate-300">{r.name ?? `Ring ${r.id}`}</span>
              </div>
              <dl className="mt-2 space-y-1 text-[11px] text-slate-400">
                <div className="flex justify-between">
                  <dt>max concurrency</dt>
                  <dd className="font-mono text-slate-200">{r.maxConcurrency ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>members</dt>
                  <dd className="font-mono text-slate-200">{r.members?.length ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>token/min</dt>
                  <dd className="font-mono text-slate-200">{r.tokenLimitPerMin ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>api/hr</dt>
                  <dd className="font-mono text-slate-200">{r.apiLimitPerHour ?? '—'}</dd>
                </div>
              </dl>
              {r.tools && r.tools.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.tools.slice(0, 6).map((t) => (
                    <span
                      key={t}
                      className="rounded border border-slate-700 bg-slate-900/60 px-1 font-mono text-[9px] text-slate-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-nexus-border bg-slate-950/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Runtime loop (worker health)
          </div>
          <dl className="mt-2 space-y-1 text-[11px] text-slate-400">
            <div className="flex justify-between">
              <dt>poll loops</dt>
              <dd className="font-mono text-slate-200">{bk.workerHealth?.pollLoops ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt>heartbeats</dt>
              <dd className="font-mono text-slate-200">{bk.workerHealth?.heartbeats ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt>stale tasks</dt>
              <dd className="font-mono text-slate-200">{bk.workerHealth?.staleTasks ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt>running</dt>
              <dd className="font-mono text-slate-200">{bk.workerHealth?.runningTasks ?? '—'}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-lg border border-nexus-border bg-slate-950/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Scheduler latency
          </div>
          <dl className="mt-2 space-y-1 text-[11px] text-slate-400">
            <div className="flex justify-between">
              <dt>p50</dt>
              <dd className="font-mono text-slate-200">
                {bk.latency?.p50Ms != null ? `${bk.latency.p50Ms}ms` : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>p95</dt>
              <dd className="font-mono text-slate-200">
                {bk.latency?.p95Ms != null ? `${bk.latency.p95Ms}ms` : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>p99</dt>
              <dd className="font-mono text-slate-200">
                {bk.latency?.p99Ms != null ? `${bk.latency.p99Ms}ms` : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>queue depth</dt>
              <dd className="font-mono text-slate-200">{bk.latency?.queueDepth ?? '—'}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-lg border border-nexus-border bg-slate-950/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Active policy</div>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone="cyan">{bk.scheduler?.policy ?? '—'}</Badge>
            {bk.scheduler?.dryRun && <Badge tone="amber">dry-run</Badge>}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Switch the policy in the Scheduler card above — it is pushed live to the real kernel.
          </p>
        </div>
      </div>
    </Card>
  );
}

export default function Kernel() {
  const s = useOS();
  const sched = os.schedulerStatus();
  const metrics = os.metricsSummary();
  const remoteOS = useOSRemote();
  const [kind, setKind] = useState<TaskKind>('interactive');
  const agentId = s.agents[0]?.id ?? 'system';

  function spawn(fail = false) {
    os.enqueueTask(agentId, `${kind} task`, kind, fail);
    os.schedulerTick();
  }

  function runDemoSaga() {
    os.startSaga('brain-import', [
      { name: 'validate', action: 'validate payload' },
      { name: 'write-memories', action: 'persist memories', compensate: 'delete memories' },
      { name: 'index', action: 'FAIL:rebuild index', compensate: 'drop index' },
      { name: 'finalize', action: 'commit' },
    ]);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <SectionTitle
          title="Kernel · Control Plane"
          subtitle="Agents, scheduler, sagas, approvals, message bus — all syscalls audited"
        />
        <Badge tone={remoteOS.dataSource === 'remote' ? 'emerald' : 'slate'} className="ml-auto">
          {remoteOS.dataSource === 'remote' ? 'live backend' : 'local simulation'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Agents" value={formatNumber(s.agents.length)} tone="cyan" />
        <Stat label="Tasks" value={formatNumber(s.tasks.length)} tone="violet" />
        <Stat label="Sagas" value={formatNumber(s.sagas.length)} tone="amber" />
        <Stat
          label="Approvals"
          value={formatNumber(s.approvals.filter((a) => a.status === 'pending').length)}
          sub="pending"
          tone="amber"
        />
        <Stat label="Syscalls" value={formatNumber(metrics.syscallCount)} tone="emerald" />
        <Stat label="Policy denials" value={formatNumber(metrics.policyDenials)} tone="rose" />
      </div>

      <BackendKernelPanel />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle title="Agents" subtitle="Registry · rings · status" />
          <div className="mt-3 space-y-2">
            {s.agents.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-nexus-border bg-slate-950/40 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-100">{a.name}</span>
                  <Badge tone={RING_TONE[a.ring]}>
                    ring {a.ring} · {RING_NAMES[a.ring]}
                  </Badge>
                  <Badge
                    tone={
                      a.status === 'active'
                        ? 'emerald'
                        : a.status === 'quarantined'
                          ? 'rose'
                          : 'slate'
                    }
                  >
                    {a.status}
                  </Badge>
                  <span className="ml-auto font-mono text-[10px] text-slate-600">
                    {timeAgo(a.lastHeartbeatAt)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {a.scopes.map((sc) => (
                    <span
                      key={sc}
                      className="rounded border border-slate-700 bg-slate-900/60 px-1 font-mono text-[9px] text-slate-400"
                    >
                      {sc}
                    </span>
                  ))}
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => os.heartbeat(a.id)}>
                      ♥
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        a.status === 'quarantined' ? os.resumeAgent(a.id) : os.quarantine(a.id)
                      }
                    >
                      {a.status === 'quarantined' ? 'resume' : 'quarantine'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle
            title="Scheduler"
            subtitle="Priority queues · starvation-aware · dead-letter"
            action={
              <Button size="sm" variant="primary" onClick={() => os.schedulerTick()}>
                Tick
              </Button>
            }
          />
          <div className="mt-3 grid grid-cols-5 gap-2">
            {(['Q0', 'Q1', 'Q2', 'Q3', 'Q4'] as QueueId[]).map((q) => (
              <div
                key={q}
                className="rounded-lg border border-nexus-border bg-slate-950/40 p-2 text-center"
              >
                <div className="font-mono text-[10px] text-slate-500">{q}</div>
                <div className="font-mono text-lg text-slate-100">{sched.depth[q]}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Policy</span>
            <Select
              value={remoteOS.scheduler.policy}
              disabled={remoteOS.dataSource !== 'remote' || remoteOS.policyBusy}
              onChange={(e) => remoteOS.setSchedulerPolicy(e.target.value)}
              className="flex-1"
            >
              <option value="mlfq">mlfq</option>
              <option value="edf">edf</option>
              <option value="fairshare">fairshare</option>
            </Select>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as TaskKind)}
              className="flex-1"
            >
              {(
                [
                  'safety',
                  'interactive',
                  'background',
                  'maintenance',
                  'self_improvement',
                ] as TaskKind[]
              ).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
            <Button variant="outline" onClick={() => spawn(false)}>
              Spawn
            </Button>
            <Button variant="danger" onClick={() => spawn(true)}>
              Spawn (fail)
            </Button>
          </div>
          <div className="mt-3 space-y-1">
            {s.tasks.slice(0, 6).map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded border border-nexus-border bg-slate-950/40 px-2 py-1"
              >
                <Badge tone="slate">{t.queue}</Badge>
                <span className="truncate text-xs text-slate-300">{t.label}</span>
                <Badge
                  tone={
                    t.status === 'succeeded'
                      ? 'emerald'
                      : t.status === 'dead_letter'
                        ? 'rose'
                        : t.status === 'failed'
                          ? 'amber'
                          : 'slate'
                  }
                >
                  {t.status}
                </Badge>
                <span className="ml-auto font-mono text-[9px] text-slate-600">
                  {t.fuelUsed}/{t.fuelBudget} fuel
                </span>
                {(t.status === 'queued' || t.status === 'running') && (
                  <Button size="sm" variant="ghost" onClick={() => os.cancelTask(t.id)}>
                    ✕
                  </Button>
                )}
              </div>
            ))}
            {!s.tasks.length && (
              <div className="py-4 text-center text-xs text-slate-600">No tasks. Spawn one.</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle
            title="Sagas"
            subtitle="Multi-step orchestration with compensation"
            action={
              <Button size="sm" variant="outline" onClick={runDemoSaga}>
                Run demo (fail @ step 3)
              </Button>
            }
          />
          <div className="mt-3 space-y-2">
            {s.sagas.slice(0, 4).map((sg) => (
              <div
                key={sg.id}
                className="rounded-lg border border-nexus-border bg-slate-950/40 p-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-200">{sg.name}</span>
                  <Badge
                    tone={
                      sg.status === 'succeeded'
                        ? 'emerald'
                        : sg.status === 'compensated'
                          ? 'amber'
                          : 'slate'
                    }
                  >
                    {sg.status}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {sg.steps.map((st) => (
                    <span
                      key={st.id}
                      className={cn(
                        'rounded border px-1 font-mono text-[9px]',
                        st.status === 'succeeded'
                          ? 'border-emerald-500/30 text-emerald-300'
                          : st.status === 'failed'
                            ? 'border-rose-500/30 text-rose-300'
                            : st.status === 'compensated'
                              ? 'border-amber-500/30 text-amber-300'
                              : 'border-slate-700 text-slate-500'
                      )}
                      title={st.result}
                    >
                      {st.name}:{st.status}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {!s.sagas.length && (
              <div className="py-4 text-center text-xs text-slate-600">
                No sagas. Run the demo to see rollback.
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle
            title="Approvals & bus"
            subtitle="Human-in-the-loop gates · async signals"
          />
          <div className="mt-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
              Pending approvals
            </div>
            <div className="space-y-1">
              {s.approvals
                .filter((a) => a.status === 'pending')
                .slice(0, 5)
                .map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1"
                  >
                    <Badge tone="amber">{a.riskLevel}</Badge>
                    <span className="truncate text-xs text-slate-300">
                      {a.action} — {a.summary}
                    </span>
                    <div className="ml-auto flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-500/40 text-emerald-300"
                        onClick={() => remoteOS.resolveApproval(a.id, true)}
                      >
                        approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-500/40 text-rose-300"
                        onClick={() => remoteOS.resolveApproval(a.id, false)}
                      >
                        deny
                      </Button>
                    </div>
                  </div>
                ))}
              {!s.approvals.some((a) => a.status === 'pending') && (
                <div className="py-2 text-xs text-slate-600">No pending approvals.</div>
              )}
            </div>
            <div className="mb-1 mt-3 text-[10px] uppercase tracking-wider text-slate-500">
              Message bus
            </div>
            <CodeBlock className="max-h-40">
              {s.bus
                .slice(0, 8)
                .map((m) => `${m.type.padEnd(22)} ${m.from}→${m.to ?? '*'}`)
                .join('\n') || '(empty)'}
            </CodeBlock>
          </div>
        </Card>
      </div>
    </div>
  );
}
