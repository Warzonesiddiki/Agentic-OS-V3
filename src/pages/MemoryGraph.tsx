import { useEffect, useState } from 'react';
import { Button, Card, SectionTitle } from '../components/ui';
import { remote } from '../lib/remote';
import { MemoryGraph, type MemoryGraphData } from '../components/memory-graph';

export default function MemoryGraphPage() {
  const [data, setData] = useState<MemoryGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    remote
      .call<MemoryGraphData>('/api/memory-graph')
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load memory graph.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Memory Graph"
        subtitle="Force-directed view of memories linked by shared tags (clusters) and creation order within a project (chains)."
        action={
          <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        }
      />

      {loading && <Card className="p-6 text-sm text-slate-400">Loading memory graph…</Card>}

      {!loading && error && (
        <Card className="border-rose-500/30 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300">
              ⚠
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Could not load graph</h3>
              <p className="text-xs text-slate-400">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {!loading && !error && data && <MemoryGraph data={data} />}
    </div>
  );
}
