import { useEffect, useMemo, useState } from 'react';
import { remote } from '../../lib/remote';
import { Badge, Button, Card, SectionTitle, cn } from '../../components/ui';

interface Tuner {
  id: string;
  name: string;
  description?: string;
  metric?: string;
  before?: number;
  after?: number;
  target?: number;
  min?: number;
  max?: number;
  unit?: string;
  status?: 'active' | 'dormant' | 'converged' | 'clamped' | string;
}
interface SelfOptState {
  tuners: Tuner[];
  guardrails?: { count?: number };
  live?: boolean;
}
interface SelfOptMetric {
  name: string;
  value: number;
  ts?: number;
}

const STATUS_TONE: Record<string, 'emerald' | 'cyan' | 'amber' | 'slate' | 'rose'> = {
  active: 'emerald',
  converged: 'cyan',
  dormant: 'slate',
  clamped: 'amber',
  error: 'rose',
};

function pct(n: number | undefined, d: number | undefined): string {
  if (n == null || d == null || d === 0) return '—';
  return `${((n / d) * 100).toFixed(1)}%`;
}

/**
 * Live Self-Optimization dashboard (Phase 18). Consumes Pulse's real
 * /api/v1/self-opt/* control plane: tuner convergence state, guardrail bounds,
 * telemetry, and live-write status. Degrades gracefully to an "awaiting
 * backend" notice if the backend self-opt router is not mounted (no stub).
 */
export default function SelfOptDashboard() {
  const [state, setState] = useState<SelfOptState | null>(null);
  const [metrics, setMetrics] = useState<SelfOptMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [tuning, setTuning] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const remoteEnabled = remote.enabled;

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, m] = await Promise.all([
        remote.selfOptState().catch((e) => {
          throw e;
        }),
        remote.selfOptMetrics(200).catch(() => ({ metrics: [] })),
      ]);
      const st = s as { data?: SelfOptState } | SelfOptState as SelfOptState;
      setState(st);
      setLive(Boolean(st.live));
      const mm = m as
        | { data?: { metrics?: SelfOptMetric[] } }
        | { metrics?: SelfOptMetric[] }
        | SelfOptMetric[] as { metrics?: SelfOptMetric[] };
      setMetrics(Array.isArray(mm) ? mm : (mm.metrics ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState(null);
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

  const tuners = useMemo(() => state?.tuners ?? [], [state]);

  const runCycle = async () => {
    setTuning('cycle');
    try {
      await remote.selfOptRunCycle();
      setToast('Optimization cycle dispatched to the live kernel.');
      await refresh();
    } catch (e) {
      setToast(e instanceof Error ? `Cycle failed: ${e.message}` : 'Cycle failed');
    } finally {
      setTuning(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const toggleLive = async () => {
    setTuning('live');
    try {
      await remote.selfOptSetLiveWrite(!live);
      setLive(!live);
      setToast(`Live-write ${!live ? 'enabled' : 'disabled'}.`);
    } catch (e) {
      setToast(e instanceof Error ? `Live-write failed: ${e.message}` : 'Live-write failed');
    } finally {
      setTuning(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const tune = async (t: Tuner) => {
    if (t.target == null) return;
    setTuning(t.id);
    try {
      await remote.selfOptTune(t.id, t.target);
      setToast(`Applied tuner "${t.name}" → ${t.target}${t.unit ?? ''}.`);
      await refresh();
    } catch (e) {
      setToast(e instanceof Error ? `Tune failed: ${e.message}` : 'Tune failed');
    } finally {
      setTuning(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  if (!remoteEnabled) {
    return (
      <Card className="p-5">
        <SectionTitle title="Self-Optimization" subtitle="Phase 18 · live tuner convergence" />
        <p className="mt-3 text-sm text-amber-300/80">
          Enable a remote server (Settings → Remote) to stream live self-optimization telemetry.
          Local mode has no running kernel to tune.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionTitle
          title="Self-Optimization"
          subtitle="Phase 18 · AI-native auto-tuning, A/B, self-heal"
        />
        <div className="flex items-center gap-2">
          <Badge tone={live ? 'emerald' : 'slate'}>{live ? '● live-write' : '○ advisory'}</Badge>
          <Button variant="ghost" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </Button>
          <Button variant="ghost" onClick={() => void toggleLive()} disabled={tuning === 'live'}>
            {live ? 'Disable live' : 'Enable live'}
          </Button>
          <Button variant="primary" onClick={() => void runCycle()} disabled={tuning === 'cycle'}>
            {tuning === 'cycle' ? 'Running…' : 'Run cycle'}
          </Button>
        </div>
      </div>

      {loading && !state && (
        <Card className="flex items-center gap-2 p-4 text-sm text-slate-400">
          Loading self-opt state…
        </Card>
      )}
      {error && (
        <Card className="border-amber-500/30 p-4">
          <p className="text-sm text-amber-300">
            Self-opt control plane unavailable: {error}. This usually means the backend self-opt
            router is not mounted. The page will retry automatically.
          </p>
        </Card>
      )}

      {toast && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-xs text-cyan-200">
          {toast}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Tuners</div>
          <div className="mt-1 text-2xl font-semibold text-slate-100">{tuners.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Active</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-300">
            {tuners.filter((t) => t.status === 'active').length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Guardrails</div>
          <div className="mt-1 text-2xl font-semibold text-cyan-300">
            {state?.guardrails?.count ?? '—'}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle title="Tuner convergence" subtitle="before → after vs target" />
        <div className="mt-3 space-y-2">
          {tuners.length === 0 && !loading && (
            <p className="text-xs text-slate-500">No tuners reported yet.</p>
          )}
          {tuners.map((t) => (
            <div key={t.id} className="rounded-lg border border-nexus-border bg-slate-950/40 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-200">{t.name}</span>
                  <Badge tone={STATUS_TONE[t.status ?? 'dormant'] ?? 'slate'}>
                    {t.status ?? 'dormant'}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => void tune(t)}
                  disabled={tuning === t.id || t.target == null}
                >
                  {tuning === t.id ? 'Applying…' : `Apply ${t.target ?? ''}${t.unit ?? ''}`}
                </Button>
              </div>
              {t.description && <p className="mt-1 text-[11px] text-slate-500">{t.description}</p>}
              <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                <div>
                  <div className="text-slate-500">before</div>
                  <div className="font-mono text-slate-200">
                    {t.before ?? '—'}
                    {t.unit ?? ''}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">after</div>
                  <div className="font-mono text-emerald-300">
                    {t.after ?? '—'}
                    {t.unit ?? ''}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">target</div>
                  <div className="font-mono text-cyan-300">
                    {t.target ?? '—'}
                    {t.unit ?? ''}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">convergence</div>
                  <div className="font-mono text-slate-200">{pct(t.after, t.target)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle title="Satisfaction loop telemetry" subtitle="recent metrics" />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {metrics.slice(0, 12).map((m) => (
            <div key={m.name} className="rounded-lg border border-nexus-border bg-slate-950/40 p-2">
              <div className="truncate text-[10px] text-slate-500">{m.name}</div>
              <div className="font-mono text-sm text-slate-200">
                {typeof m.value === 'number' ? m.value.toFixed(3) : m.value}
              </div>
            </div>
          ))}
          {metrics.length === 0 && !loading && (
            <p className="col-span-full text-xs text-slate-500">No metrics reported yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
