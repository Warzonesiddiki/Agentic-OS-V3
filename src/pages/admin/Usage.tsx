import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';

/**
 * Usage & Analytics — recharts dashboard fed by the billing/usage metering API.
 */
export default function AdminUsage() {
  const orgId = useAuthStore((s) => s.user?.orgId ?? '');
  const { data, isLoading } = useQuery<UsageSummary>({
    queryKey: ['usage', orgId],
    queryFn: () => apiClient.getUsage(orgId, '30d'),
    enabled: !!orgId,
  });

  if (isLoading || !data) return <div className="text-zinc-500">Loading usage…</div>;

  const chart = data.series.map((p) => ({
    ts: p.ts.slice(0, 10),
    requests: p.requests,
    tokens: p.tokens,
    cost: p.costUsd,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Usage & Analytics</h1>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total Requests" value={data.totalRequests.toLocaleString()} />
        <Stat label="Total Tokens" value={data.totalTokens.toLocaleString()} />
        <Stat label="Cost (30d)" value={`$${data.totalCostUsd.toFixed(2)}`} />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-2 text-sm text-zinc-400">Requests / day</div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="ts" stroke="#71717a" />
            <YAxis stroke="#71717a" />
            <Tooltip />
            <Line type="monotone" dataKey="requests" stroke="#6366f1" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-2 text-sm text-zinc-400">Tokens / day</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="ts" stroke="#71717a" />
            <YAxis stroke="#71717a" />
            <Tooltip />
            <Bar dataKey="tokens" fill="#22d3ee" />
          </BarChart>
        </ResponsiveContainer>
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
