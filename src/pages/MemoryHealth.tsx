import { useEffect, useState, useSyncExternalStore } from 'react';
import { Card, SectionTitle, Badge, EmptyState } from '../components/ui';
import { MemoryHealth } from '../components/memory-health';
import type { MemoryHealthPayload } from '../components/memory-health';
import { getRemote, remote as remoteApi, subscribeRemote } from '../lib/remote';

export default function MemoryHealthPage() {
  const [data, setData] = useState<MemoryHealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const remote = useSyncExternalStore(subscribeRemote, getRemote, getRemote);

  useEffect(() => {
    if (!remote.enabled) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    remoteApi
      .call<MemoryHealthPayload>('/api/memory-health')
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load memory health');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [remote.enabled, remote.baseUrl, remote.apiKey]);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Memory Health"
        subtitle="Aggregate health signals for the memory store"
      />
      {!remote.enabled && (
        <EmptyState
          title="Remote backend not connected"
          hint="Enable a NEXUS server in Settings → Remote to view memory health."
        />
      )}
      {remote.enabled && loading && <Badge tone="slate">loading…</Badge>}
      {remote.enabled && error && <Card className="p-4 text-sm text-rose-300">{error}</Card>}
      {remote.enabled && data && <MemoryHealth metrics={data} />}
    </div>
  );
}
