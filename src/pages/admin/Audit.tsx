import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';
import type { AuditEvent } from '../../lib/enterprise-types';

/**
 * Audit Trail — filters (actor/action/outcome/date) + CSV/JSON/PDF export.
 * Data shape (AuditEvent) matches the audit/SIEM contract from Sentinel.
 */
export default function AdminAudit() {
  const orgId = useAuthStore((s) => s.user?.orgId ?? '');
  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState('');

  const { data, isLoading, isError, error } = useQuery<AuditEvent[]>({
    queryKey: ['audit', orgId, action, outcome],
    queryFn: () =>
      apiClient.listAudit(orgId, {
        action: action || undefined,
        outcome: outcome || undefined,
        limit: 200,
      }),
    enabled: !!orgId,
  });

  const exportAs = async (format: 'csv' | 'json' | 'pdf') => {
    const blob = await apiClient.exportAudit(orgId, format);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Audit Trail</h1>
        <div className="space-x-2">
          <button className="rounded bg-zinc-800 px-3 py-1 text-sm" onClick={() => exportAs('csv')}>
            Export CSV
          </button>
          <button
            className="rounded bg-zinc-800 px-3 py-1 text-sm"
            onClick={() => exportAs('json')}
          >
            Export JSON
          </button>
          <button className="rounded bg-zinc-800 px-3 py-1 text-sm" onClick={() => exportAs('pdf')}>
            Export PDF
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          className="rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          placeholder="Filter action…"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <select
          className="rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        >
          <option value="">Any outcome</option>
          <option value="success">success</option>
          <option value="denied">denied</option>
          <option value="error">error</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-zinc-500">Loading…</div>
      ) : isError ? (
        <div className="text-red-400">
          Failed to load audit log: {error instanceof Error ? error.message : 'unknown error'}
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="text-zinc-500">No audit events found.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-400">
            <tr>
              <th scope="col" className="py-2">Time</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Resource</th>
              <th scope="col">Outcome</th>
              <th scope="col">IP</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((e) => (
              <tr key={e.id} className="border-t border-zinc-800">
                <td className="py-2">{new Date(e.ts).toLocaleString()}</td>
                <td>{e.actorEmail ?? 'system'}</td>
                <td>{e.action}</td>
                <td>
                  {e.resource}
                  {e.resourceId ? `:${e.resourceId.slice(0, 8)}` : ''}
                </td>
                <td
                  className={
                    e.outcome === 'denied'
                      ? 'text-red-400'
                      : e.outcome === 'error'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                  }
                >
                  {e.outcome}
                </td>
                <td>{e.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
