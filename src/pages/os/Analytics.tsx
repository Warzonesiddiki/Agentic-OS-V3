/**
 * Analytics.tsx — Deep analytics dashboard.
 *
 * Fetches aggregated data from the server's /api/v1/analytics endpoint and
 * visualizes: daily activity trends, tool call breakdown, agent status
 * distribution, and total token savings.
 */
import { useState, useEffect } from "react";
import { remote as remoteApi, getRemote } from "../../lib/remote";
import { Badge, Card, SectionTitle, Stat } from "../../components/ui";
import { formatCompact, formatNumber } from "../../lib/core";

interface AnalyticsData {
  totals: { memories: number; skills: number; audit: number; tokensSaved: number; agents: number; tasks: number };
  dailyActivity: Array<{ day: string; events: number; tokensSaved: number }>;
  toolCalls: Array<{ action: string; count: number }>;
  agentActivity: Array<{ status: string; count: number }>;
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remote = getRemote();

  async function fetchAnalytics() {
    setLoading(true);
    setError(null);
    try {
      const result = await remoteApi.analytics() as AnalyticsData;
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch analytics");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (remote.enabled) fetchAnalytics();
  }, [remote.enabled]);

  if (!remote.enabled) {
    return (
      <div className="space-y-5">
        <SectionTitle title="Analytics Dashboard" subtitle="Deep insights into agent activity and token economics" />
        <Card className="border-amber-500/30 p-4">
          <p className="text-sm text-amber-300">
            Analytics requires a remote server connection. Enable it in Settings → Remote, then return here.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Analytics Dashboard"
        subtitle="Sessions, tool calls, token spend, and 30-day trends"
        action={<button onClick={fetchAnalytics} className="text-xs text-cyan-400 hover:underline" disabled={loading}>{loading ? "refreshing…" : "refresh →"}</button>}
      />

      {error && (
        <Card className="border-rose-500/30 p-3">
          <p className="text-sm text-rose-300">Error: {error}</p>
        </Card>
      )}

      {data && (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Memories" value={formatNumber(data.totals.memories)} tone="violet" />
            <Stat label="Skills" value={formatNumber(data.totals.skills)} tone="cyan" />
            <Stat label="Agents" value={formatNumber(data.totals.agents)} tone="emerald" />
            <Stat label="Tasks" value={formatNumber(data.totals.tasks)} tone="amber" />
            <Stat label="Tokens Saved" value={formatCompact(data.totals.tokensSaved)} tone="emerald" />
            <Stat label="Audit Events" value={formatNumber(data.totals.audit)} tone="violet" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Daily Activity Chart */}
            <Card className="p-4">
              <SectionTitle title="30-Day Activity" subtitle="Daily events + tokens saved" />
              <div className="mt-4 space-y-1">
                {data.dailyActivity.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-600">No activity yet.</div>
                ) : (
                  data.dailyActivity.slice(-14).map((d) => {
                    const maxEvents = Math.max(...data.dailyActivity.map((x) => x.events), 1);
                    return (
                      <div key={d.day} className="flex items-center gap-2">
                        <span className="w-20 font-mono text-[9px] text-slate-600">{d.day.slice(5)}</span>
                        <div className="h-5 flex-1 overflow-hidden rounded bg-slate-800/50">
                          <div
                            className="h-full rounded bg-gradient-to-r from-cyan-500/60 to-emerald-500/60"
                            style={{ width: `${(d.events / maxEvents) * 100}%` }}
                          />
                        </div>
                        <span className="w-20 text-right font-mono text-[9px] text-slate-500">{d.events} ev · {formatCompact(d.tokensSaved)} tok</span>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* Tool Call Breakdown */}
            <Card className="p-4">
              <SectionTitle title="Tool Calls" subtitle="By action type" />
              <div className="mt-4 space-y-1">
                {data.toolCalls.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-600">No tool calls logged.</div>
                ) : (
                  data.toolCalls.map((t) => {
                    const maxCount = Math.max(...data.toolCalls.map((x) => x.count), 1);
                    return (
                      <div key={t.action} className="flex items-center gap-2">
                        <span className="w-40 truncate font-mono text-[9px] text-slate-400">{t.action}</span>
                        <div className="h-4 flex-1 overflow-hidden rounded bg-slate-800/50">
                          <div className="h-full rounded bg-cyan-500/40" style={{ width: `${(t.count / maxCount) * 100}%` }} />
                        </div>
                        <span className="w-12 text-right font-mono text-[9px] text-slate-500">{t.count}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          {/* Agent Status Distribution */}
          <Card className="p-4">
            <SectionTitle title="Agent Status Distribution" />
            <div className="mt-3 flex flex-wrap gap-2">
              {data.agentActivity.length === 0 ? (
                <span className="text-xs text-slate-600">No agents registered.</span>
              ) : (
                data.agentActivity.map((a) => (
                  <Badge key={a.status} tone={a.status === "errored" || a.status === "quarantined" ? "rose" : a.status === "completed" ? "emerald" : "slate"}>
                    {a.status}: {a.count}
                  </Badge>
                ))
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
