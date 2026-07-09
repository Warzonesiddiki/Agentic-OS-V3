import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';

/** SIEM Streaming — configure sinks (Splunk/Datadog/Elastic/Webhook). */
export default function AdminSiem() {
  const orgId = useAuthStore((s) => s.user?.orgId ?? '');
  const qc = useQueryClient();
  const [kind, setKind] = useState<'splunk' | 'datadog' | 'elastic' | 'webhook'>('webhook');
  const [endpoint, setEndpoint] = useState('');

  const { data, isError, error } = useQuery<SiemSink[]>({
    queryKey: ['siem', orgId],
    queryFn: () => apiClient.listSiemSinks(orgId),
    enabled: !!orgId,
  });
  const add = useMutation({
    mutationFn: () => apiClient.createSiemSink(orgId, { kind, endpoint, enabled: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['siem', orgId] });
      setEndpoint('');
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">SIEM Streaming</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <select
          className="rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="webhook">webhook</option>
          <option value="splunk">splunk</option>
          <option value="datadog">datadog</option>
          <option value="elastic">elastic</option>
        </select>
        <input
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          placeholder="Endpoint URL"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
        />
        <button className="rounded bg-indigo-600 px-3 py-2 text-sm" disabled={add.isPending}>
          Add sink
        </button>
      </form>
      {isError && (
        <div className="text-red-400">
          Failed to load SIEM sinks: {error instanceof Error ? error.message : 'unknown error'}
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-400">
          <tr>
            <th scope="col" className="py-2">Kind</th>
            <th scope="col">Endpoint</th>
            <th scope="col">Enabled</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((s) => (
            <tr key={s.id} className="border-t border-zinc-800">
              <td className="py-2">{s.kind}</td>
              <td>{s.endpoint}</td>
              <td>{s.enabled ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
