import { useEffect, useState } from 'react';
import { remote } from '../../lib/remote';
import { Badge, Button, Card, SectionTitle, cn } from '../../components/ui';

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
interface Tuner {
  id: string;
  name: string;
  description?: string;
  metric?: string;
  before?: number;
  after?: number;
  target?: number;
  unit?: string;
  status?: string;
}
interface SelfOptState {
  tuners: Tuner[];
  live?: boolean;
  guardrails?: { count?: number };
}

const STATUS_TONE: Record<string, 'emerald' | 'cyan' | 'amber' | 'slate' | 'rose'> = {
  active: 'emerald',
  converged: 'cyan',
  dormant: 'slate',
  clamped: 'amber',
  error: 'rose',
};

/**
 * Reliability & Self-Heal dashboard (Phase 20 + 18). Consumes REAL backend
 * signals: kernel worker-health + scheduler latency (chaos/self-heal
 * observables) and the self-opt tuner convergence loop (self-heal). Degrades
 * gracefully to an "awaiting backend" notice when remote is OFF. No stub.
 */
export default function Reliability() {
  const [worker, setWorker] = useState<WorkerHealth | null>(null);
  const [latency, setLatency] = useState<SchedLatency | null>(null);
  const [selfOpt, setSelfOpt] = useState<SelfOptState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const remoteEnabled = remote.enabled;

  const refresh = async () => {
    setError(null);
    try {
      const [w, l, s] = await Promise.all([
        remote.workerHealth().catch(() => null),
        remote.schedulerLatency().catch(() => null),
        remote.selfOptState().catch(() => null),
      ]);
      setWorker((w as WorkerHealth) ?? null);
      setLatency((l as SchedLatency) ?? null);
      setSelfOpt((s as SelfOptState) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!remoteEnabled) {
      setLoading(false);
      return;
    }
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteEnabled]);

  if (!remoteEnabled) {
    return (
      <Card className="p-5">
        <SectionTitle
          title="Reliability & Self-Heal"
          subtitle="Phase 20 · chaos, SLO, self-healing"
        />
        <p className="mt-3 text-sm text-amber-300/80">
          Enable a remote server (Settings → Remote) to stream live reliability telemetry.
        </p>
      </Card>
    );
  }

  const tuners = selfOpt?.tuners ?? [];
  const selfHealActive = tuners.some((t) => t.status === 'active');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionTitle
          title="Reliability & Self-Heal"
          subtitle="Phase 20 · chaos observables · self-healing loop"
        />
        <Button variant="ghost" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading && !worker && !latency && !selfOpt && (
        <Card className="p-4 text-sm text-slate-400">Loading reliability telemetry…</Card>
      )}
      {error && (
        <Card className="border-amber-500/30 p-4">
          <p className="text-sm text-amber-300">
            Reliability control plane partially unavailable: {error}. Retrying automatically.
          </p>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Runtime loop</div>
          <div className="mt-1 text-2xl font-semibold text-slate-100">
            {worker?.pollLoops ?? '—'}
          </div>
          <div className="text-[11px] text-slate-500">
            poll loops · {worker?.heartbeats ?? '—'} heartbeats
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Queue latency p99
          </div>
          <div className="mt-1 text-2xl font-semibold text-emerald-300">
            {latency?.p99Ms != null ? `${latency.p99Ms}ms` : '—'}
          </div>
          <div className="text-[11px] text-slate-500">
            p50 {latency?.p50Ms ?? '—'}ms · p95 {latency?.p95Ms ?? '—'}ms
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Self-heal</div>
          <div className="mt-1 text-2xl font-semibold text-cyan-300">
            {selfHealActive ? 'active' : 'idle'}
          </div>
          <div className="text-[11px] text-slate-500">
            {tuners.length} tuners · {selfOpt?.guardrails?.count ?? '—'} guardrails
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle
          title="Chaos / self-heal observables"
          subtitle="stale tasks, running, queue depth"
        />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-nexus-border bg-slate-950/40 p-3">
            <div className="text-[10px] uppercase text-slate-500">stale tasks</div>
            <div className="font-mono text-lg text-rose-300">{worker?.staleTasks ?? '—'}</div>
          </div>
          <div className="rounded-lg border border-nexus-border bg-slate-950/40 p-3">
            <div className="text-[10px] uppercase text-slate-500">running</div>
            <div className="font-mono text-lg text-emerald-300">{worker?.runningTasks ?? '—'}</div>
          </div>
          <div className="rounded-lg border border-nexus-border bg-slate-950/40 p-3">
            <div className="text-[10px] uppercase text-slate-500">last tick</div>
            <div className="font-mono text-lg text-slate-200">
              {worker?.lastTickMs != null ? `${worker.lastTickMs}ms` : '—'}
            </div>
          </div>
          <div className="rounded-lg border border-nexus-border bg-slate-950/40 p-3">
            <div className="text-[10px] uppercase text-slate-500">queue depth</div>
            <div className="font-mono text-lg text-cyan-300">{latency?.queueDepth ?? '—'}</div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle title="Self-healing tuners" subtitle="auto-tuned runtime-loop parameters" />
        <div className="mt-3 space-y-2">
          {tuners.length === 0 && !loading && (
            <p className="text-xs text-slate-500">No self-heal tuners reported yet.</p>
          )}
          {tuners.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-lg border border-nexus-border bg-slate-950/40 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-200">{t.name}</span>
                <Badge tone={STATUS_TONE[t.status ?? 'dormant'] ?? 'slate'}>
                  {t.status ?? 'dormant'}
                </Badge>
              </div>
              <div className="font-mono text-[11px] text-slate-400">
                {t.before ?? '—'} → <span className="text-emerald-300">{t.after ?? '—'}</span> /
                target {t.target ?? '—'}
                {t.unit ?? ''}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
