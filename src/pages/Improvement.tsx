import { useState, useMemo } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, SectionTitle } from "../components/ui";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { RefetchIndicator } from "../components/RefetchIndicator";
import { toast } from "../lib/toast";
import { v3 } from "../lib/remote";
import { useV3Query } from "../lib/hooks";

interface Proposal { id: string; title: string; summary: string; hypothesis: string; targetMetric: string; baselineValue: number; expectedDelta: number; riskClass: string; status: string; patch: { kind: string; key: string; value: string | number | boolean }; author: string; reviewer?: string; measuredDelta?: number; createdAt: string }

export default function Improvement() {
  const [filterStatus, setFilterStatus] = useState("");

  const proposalsPath = useMemo(() => {
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    params.set("limit", "50");
    return `/api/v1/v3/improvement/proposals?${params}`;
  }, [filterStatus]);

  const { data: proposalsResp, loading, isRefetching, refetch } = useV3Query<{ items: Proposal[] }>(proposalsPath, [filterStatus]);
  const proposals = proposalsResp?.items ?? [];

  const [metricName, setMetricName] = useState("http_request_duration_ms");
  const [metricValue, setMetricValue] = useState("150");
  const [tickMetrics, setTickMetrics] = useState("http_request_duration_ms");
  const [tickResult, setTickResult] = useState<string | null>(null);

  async function recordMetric() {
    const d = await v3.call("/api/v1/v3/improvement/metrics", {
      method: "POST",
      body: JSON.stringify({ metric: metricName, value: Number(metricValue), windowMs: 60000 }),
    });
    if (d.ok) toast.success("Metric recorded");
    else toast.danger(d.error?.message || "Failed to record metric");
  }

  async function runTick() {
    const d = await v3.call("/api/v1/v3/improvement/tick", {
      method: "POST",
      body: JSON.stringify({ metrics: tickMetrics.split(",").map(s => s.trim()).filter(Boolean) }),
    });
    setTickResult(d.ok ? `Created ${(d.data as { proposalsCreated: number })?.proposalsCreated ?? 0} proposal(s)` : d.error?.message || "Error");
    refetch();
  }

  async function approve(id: string) {
    const d = await v3.call(`/api/v1/v3/improvement/proposals/${id}/approve`, { method: "POST", body: "{}" });
    if (d.ok) toast.success("Proposal approved");
    else toast.danger(d.error?.message || "Approve failed");
    refetch();
  }

  async function reject(id: string) {
    const reason = prompt("Rejection reason:");
    if (!reason) return;
    const d = await v3.call(`/api/v1/v3/improvement/proposals/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    if (d.ok) toast.success("Proposal rejected");
    else toast.danger(d.error?.message || "Reject failed");
    refetch();
  }

  async function apply(id: string) {
    const d = await v3.call(`/api/v1/v3/improvement/proposals/${id}/apply`, { method: "POST", body: "{}" });
    if (d.ok) toast.success("Applied to canary");
    else toast.danger(d.error?.message || "Apply failed");
    refetch();
  }

  async function finalize(id: string) {
    const d = await v3.call(`/api/v1/v3/improvement/proposals/${id}/finalize`, { method: "POST", body: "{}" });
    if (d.ok) toast.success("Proposal finalized");
    else toast.danger(d.error?.message || "Finalize failed");
    refetch();
  }

  const statusTone = (s: string) => {
    if (s === "rolled_out") return "emerald";
    if (s === "reverted" || s === "rejected") return "rose";
    if (s === "canary") return "amber";
    if (s === "testing") return "cyan";
    return "slate";
  };

  const riskTone = (r: string) => {
    if (r === "SAFETY") return "rose";
    if (r === "BLOCKING") return "amber";
    return "slate";
  };

  return (
    <div className="space-y-6">
      <RefetchIndicator active={isRefetching} />
      <SectionTitle title="Self-Improvement Harness" subtitle="Metric collection, regression detection, and advisory proposal lifecycle" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Record Metric" subtitle="Snapshot a metric value for regression analysis" />
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Metric name"><Input value={metricName} onChange={e => setMetricName(e.target.value)} /></Field>
              <Field label="Value"><Input value={metricValue} onChange={e => setMetricValue(e.target.value)} /></Field>
            </div>
            <Button variant="primary" onClick={recordMetric}>Record</Button>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Regression Tick" subtitle="Run the auto-detection loop across specified metrics" />
          <div className="mt-3 space-y-3">
            <Field label="Metrics (comma separated)"><Input value={tickMetrics} onChange={e => setTickMetrics(e.target.value)} /></Field>
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={runTick}>Run Tick</Button>
              {tickResult && <Badge tone="emerald">{tickResult}</Badge>}
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-3">
        <div className="flex items-center gap-2">
          {["", "draft", "testing", "canary", "rolled_out", "reverted", "rejected"].map(s => (
            <Button key={s} size="sm" variant={filterStatus === s ? "primary" : "ghost"} onClick={() => setFilterStatus(s)}>
              {s || "All"}
            </Button>
          ))}
          <span className="ml-auto text-xs text-slate-500">{proposals.length} proposals</span>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonLoader key={i} variant="card" />)}
        </div>
      ) : proposals.length === 0 ? (
        <EmptyState title="No improvement proposals" hint="Run a regression tick or create a manual proposal to get started." />
      ) : (
        <div className="space-y-3">
          {proposals.map(p => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                    <Badge tone={riskTone(p.riskClass)}>{p.riskClass}</Badge>
                    <h3 className="truncate text-sm font-semibold text-slate-100">{p.title}</h3>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{p.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                    <span className="text-slate-500">metric: <span className="text-cyan-400">{p.targetMetric}</span></span>
                    <span className="text-slate-500">baseline: <span className="text-slate-300">{p.baselineValue.toFixed(2)}</span></span>
                    <span className="text-slate-500">patch: <span className="text-amber-400">{p.patch.kind} → {p.patch.key}</span></span>
                    {p.measuredDelta !== null && p.measuredDelta !== undefined && (
                      <span className={p.measuredDelta < 0 ? "text-emerald-400" : "text-rose-400"}>Δ {p.measuredDelta.toFixed(2)}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {p.status === "draft" && <>
                    <Button size="sm" variant="ghost" className="text-emerald-400" onClick={() => approve(p.id)}>approve</Button>
                    <Button size="sm" variant="ghost" className="text-rose-400" onClick={() => reject(p.id)}>reject</Button>
                  </>}
                  {p.status === "testing" && <Button size="sm" variant="ghost" className="text-amber-400" onClick={() => apply(p.id)}>apply canary</Button>}
                  {p.status === "canary" && <Button size="sm" variant="ghost" className="text-cyan-400" onClick={() => finalize(p.id)}>finalize</Button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
