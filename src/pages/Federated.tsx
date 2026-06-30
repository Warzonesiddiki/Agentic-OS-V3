import { useState, useMemo } from "react";
import { Badge, Button, Card, EmptyState, SectionTitle, Stat } from "../components/ui";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { RefetchIndicator } from "../components/RefetchIndicator";
import { useV3Query } from "../lib/hooks";

interface Proof { id: string; originPeerId: string; contentSha256: string; importance: number; privacyClass: string; materialized: boolean; rejectReason?: string; topicTags: string[]; receivedAt: string }
interface Stats { total: number; materialized: number; rejected: number; byReason: Record<string, number>; byTopic: Record<string, number> }

export default function Federated() {
  const [filter, setFilter] = useState<"all" | "materialized" | "rejected">("all");
  const [topicFilter, setTopicFilter] = useState("");

  const proofsPath = useMemo(() => {
    const params = new URLSearchParams();
    if (filter === "materialized") params.set("materialized", "true");
    if (filter === "rejected") params.set("materialized", "false");
    if (topicFilter) params.set("topic", topicFilter);
    params.set("limit", "50");
    return `/api/v1/v3/federated/proofs?${params}`;
  }, [filter, topicFilter]);

  const { data: proofsResp, loading: loadingProofs, isRefetching: refetchingProofs } = useV3Query<{ items: Proof[] }>(proofsPath, [filter, topicFilter]);
  const { data: stats, loading: loadingStats, isRefetching: refetchingStats } = useV3Query<Stats>("/api/v1/v3/federated/stats", []);
  const proofs = proofsResp?.items ?? [];

  return (
    <div className="space-y-6">
      <RefetchIndicator active={refetchingProofs || refetchingStats} />
      <SectionTitle title="Federated Recall" subtitle="Privacy-preserving cross-instance memory sharing protocol" />

      {loadingStats && !stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-nexus-border bg-nexus-panel p-4">
              <SkeletonLoader lines={2} />
            </div>
          ))}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Total Proofs" value={String(stats.total)} tone="cyan" />
          <Stat label="Materialized" value={String(stats.materialized)} tone="emerald" />
          <Stat label="Rejected" value={String(stats.rejected)} tone="rose" />
          <Stat label="Topics" value={String(Object.keys(stats.byTopic).length)} tone="amber" />
          <Stat label="Rejection Reasons" value={String(Object.keys(stats.byReason).length)} />
        </div>
      )}

      {stats && Object.keys(stats.byTopic).length > 0 && (
        <Card className="p-4">
          <SectionTitle title="Topic Distribution" />
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(stats.byTopic).sort((a, b) => b[1] - a[1]).map(([topic, count]) => (
              <button key={topic} onClick={() => setTopicFilter(topicFilter === topic ? "" : topic)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${topicFilter === topic ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
                {topic} <span className="ml-1 text-[10px] text-slate-600">({count})</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-3">
        <div className="flex items-center gap-2">
          {(["all", "materialized", "rejected"] as const).map(f => (
            <Button key={f} size="sm" variant={filter === f ? "primary" : "ghost"} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "materialized" ? "✓ Materialized" : "✗ Rejected"}
            </Button>
          ))}
          {topicFilter && <Badge tone="cyan">topic: {topicFilter} <button className="ml-1 text-slate-500 hover:text-slate-300" onClick={() => setTopicFilter("")}>×</button></Badge>}
          <span className="ml-auto text-xs text-slate-500">{proofs.length} proofs</span>
        </div>
      </Card>

      {loadingProofs ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonLoader key={i} variant="card" />)}
        </div>
      ) : proofs.length === 0 ? (
        <EmptyState title="No proofs found" hint="Proofs arrive via the federated gossip protocol on topic 'nexus.recall.v1'." />
      ) : (
        <div className="space-y-2">
          {proofs.map(p => (
            <Card key={p.id} className="p-3">
              <div className="flex items-center gap-3">
                <Badge tone={p.materialized ? "emerald" : "rose"}>{p.materialized ? "materialized" : "rejected"}</Badge>
                <Badge tone="slate">{p.privacyClass}</Badge>
                <span className="truncate text-xs text-slate-400">{p.originPeerId}</span>
                <span className="ml-auto font-mono text-[10px] text-slate-600">{p.contentSha256.slice(0, 16)}…</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex flex-wrap gap-1">
                  {p.topicTags.map(t => <Badge key={t} tone="cyan">{t}</Badge>)}
                </div>
                <span className="ml-auto text-[10px] text-slate-500">importance {Math.round(p.importance * 100)}%</span>
                {p.rejectReason && <Badge tone="amber">{p.rejectReason}</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
