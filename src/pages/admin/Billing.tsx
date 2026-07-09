import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';

/** Billing — meter, seats, plan, budget alerts. */
export default function AdminBilling() {
  const orgId = useAuthStore((s) => s.user?.orgId ?? '');
  const qc = useQueryClient();
  const [pct, setPct] = useState(80);
  const { data } = useQuery<BillingMeter>({
    queryKey: ['billing', orgId],
    queryFn: () => apiClient.getBilling(orgId),
    enabled: !!orgId,
  });
  const setAlert = useMutation({
    mutationFn: () => apiClient.setBudgetAlert(orgId, pct),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing', orgId] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Billing</h1>
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Plan" value={data.plan} />
          <Stat label="Seats" value={`${data.seatUsage}/${data.seatLimit}`} />
          <Stat label="Period cost" value={`$${data.currentPeriodCostUsd.toFixed(2)}`} />
          <Stat label="Meter" value={`${data.meterUsage}/${data.meterLimit}`} />
          <Stat label="Budget alert" value={`${data.budgetAlertPct}%`} />
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="text-sm text-zinc-400">Budget alert threshold %</label>
        <input
          type="number"
          className="w-20 rounded border border-zinc-700 bg-zinc-900 p-1 text-sm"
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
        />
        <button
          className="rounded bg-indigo-600 px-3 py-1 text-sm"
          onClick={() => setAlert.mutate()}
          disabled={setAlert.isPending}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
