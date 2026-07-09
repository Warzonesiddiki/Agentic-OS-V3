import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';

/** API Keys — create (reveals secret once) + revoke, with rate-limit tiers. */
export default function AdminKeys() {
  const orgId = useAuthStore((s) => s.user?.orgId ?? '');
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [tier, setTier] = useState<'free' | 'tier1' | 'tier2' | 'tier3'>('tier1');
  const [revealed, setRevealed] = useState<string | null>(null);

  const { data } = useQuery<ApiKey[]>({
    queryKey: ['keys', orgId],
    queryFn: () => apiClient.listApiKeys(orgId),
    enabled: !!orgId,
  });

  const createM = useMutation({
    mutationFn: () => apiClient.createApiKey(orgId, { label, tier, scopes: ['read', 'write'] }),
    onSuccess: (k) => {
      setRevealed(k.secret);
      qc.invalidateQueries({ queryKey: ['keys', orgId] });
      setLabel('');
    },
  });
  const revokeM = useMutation({
    mutationFn: (id: string) => apiClient.revokeApiKey(orgId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keys', orgId] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">API Keys</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          createM.mutate();
        }}
      >
        <input
          className="rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          placeholder="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <select
          className="rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          value={tier}
          onChange={(e) => setTier(e.target.value as typeof tier)}
        >
          <option value="free">free</option>
          <option value="tier1">tier1</option>
          <option value="tier2">tier2</option>
          <option value="tier3">tier3</option>
        </select>
        <button className="rounded bg-indigo-600 px-3 py-2 text-sm" disabled={createM.isPending}>
          Create
        </button>
      </form>
      {revealed && (
        <div className="rounded bg-amber-950/40 p-3 text-sm text-amber-300">
          Secret (copy now): <code>{revealed}</code>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-400">
          <tr>
            <th scope="col" className="py-2">Label</th>
            <th scope="col">Prefix</th>
            <th scope="col">Tier</th>
            <th scope="col">RPM</th>
            <th scope="col">Last used</th>
            <th scope="col" aria-label="Actions"></th>
          </tr>
        </thead>
        <tbody>
          {data?.map((k) => (
            <tr key={k.id} className="border-t border-zinc-800">
              <td className="py-2">{k.label}</td>
              <td>{k.prefix}</td>
              <td>{k.tier}</td>
              <td>{k.rateLimitRpm}</td>
              <td>{k.lastUsedAt ?? '—'}</td>
              <td className="text-right">
                <button className="text-red-400" onClick={() => revokeM.mutate(k.id)}>
                  Revoke
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
