import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';

/** Tenant & Retention — audit/memory retention, PITR, CMK, data residency. */
export default function AdminTenant() {
  const orgId = useAuthStore((s) => s.user?.orgId ?? '');
  const qc = useQueryClient();
  const { data } = useQuery<TenantRetention>({
    queryKey: ['tenant', orgId],
    queryFn: () => apiClient.getTenantConfig(orgId),
    enabled: !!orgId,
  });
  const [auditDays, setAuditDays] = useState(365);
  const [pitr, setPitr] = useState(false);
  const [cmk, setCmk] = useState(false);

  // Sync local form state once the backend config loads (single run on load).
  useEffect(() => {
    if (data) {
      setAuditDays(data.auditDays);
      setPitr(data.backupPitr);
      setCmk(data.cmkEnabled);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiClient.updateTenantConfig(orgId, { auditDays, backupPitr: pitr, cmkEnabled: cmk }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', orgId] }),
  });
  const backup = useMutation({ mutationFn: () => apiClient.triggerBackup(orgId) });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Tenant & Retention</h1>
      <label className="block text-sm">
        Audit retention (days)
        <input
          type="number"
          className="ml-2 rounded border border-zinc-700 bg-zinc-900 p-1"
          value={auditDays}
          onChange={(e) => setAuditDays(Number(e.target.value))}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={pitr} onChange={(e) => setPitr(e.target.checked)} />{' '}
        Point-in-time recovery (PITR)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={cmk} onChange={(e) => setCmk(e.target.checked)} />{' '}
        Customer-managed key (CMK)
      </label>
      <div className="space-x-2">
        <button
          className="rounded bg-indigo-600 px-3 py-2 text-sm"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          Save
        </button>
        <button
          className="rounded bg-zinc-800 px-3 py-2 text-sm"
          onClick={() => backup.mutate()}
          disabled={backup.isPending}
        >
          Trigger backup
        </button>
      </div>
    </div>
  );
}
