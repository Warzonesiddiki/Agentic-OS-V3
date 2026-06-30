import { useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, SectionTitle, Textarea } from "../components/ui";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { RefetchIndicator } from "../components/RefetchIndicator";
import { toast } from "../lib/toast";
import { v3 } from "../lib/remote";
import { useV3Query } from "../lib/hooks";

interface Pipeline { id: string; name: string; description: string; enabled: boolean; author: string; createdAt: string; dag: { nodes: Array<{ id: string; type: string }>; edges: Array<{ from: string; to: string }> } }
interface PipelineRun { id: string; status: string; durationMs: number; startedAt: string; triggeredBy: string; error?: string }

export default function Pipelines() {
  const { data: pipelinesResp, loading, isRefetching, refetch } = useV3Query<{ items: Pipeline[] }>("/api/v1/v3/pipelines", []);
  const pipelines = pipelinesResp?.items ?? [];

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", dagJson: '{\n  "nodes": [\n    { "id": "start", "type": "trigger.manual", "position": {"x":0,"y":0}, "config": {} }\n  ],\n  "edges": []\n}' });
  const [validation, setValidation] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [selectedRuns, setSelectedRuns] = useState<string | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  async function validate() {
    let dag: unknown;
    try { dag = JSON.parse(createForm.dagJson); } catch { setValidation({ ok: false, reason: "Invalid JSON" }); return; }
    const d = await v3.call("/api/v1/v3/pipelines/validate-dag", {
      method: "POST",
      body: JSON.stringify(dag),
    });
    setValidation(d.ok && d.data ? { ok: (d.data as { ok: boolean }).ok, reason: (d.data as { ok: boolean; reason?: string }).reason } : { ok: false, reason: d.error?.message || "API error" });
  }

  async function create() {
    let dag: Record<string, unknown>;
    try { dag = JSON.parse(createForm.dagJson) as Record<string, unknown>; } catch { toast.danger("Invalid JSON in DAG definition"); return; }
    const d = await v3.call("/api/v1/v3/pipelines", {
      method: "POST",
      body: JSON.stringify({ name: createForm.name, description: createForm.description, ...dag }),
    });
    if (d.ok) { toast.success("Pipeline created: " + createForm.name); setShowCreate(false); setValidation(null); refetch(); }
    else toast.danger(d.error?.message || "Pipeline creation failed");
  }

  async function runPipeline(id: string) {
    const d = await v3.call(`/api/v1/v3/pipelines/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ inputs: {} }),
    });
    if (d.ok) toast.success("Pipeline run started");
    else toast.danger(d.error?.message || "Run failed");
  }

  async function viewRuns(id: string) {
    setSelectedRuns(id);
    setLoadingRuns(true);
    const d = await v3.call(`/api/v1/v3/pipelines/${id}/runs`);
    if (d.ok && d.data) setRuns((d.data as { runs: PipelineRun[] }).runs ?? []);
    else toast.danger(d.error?.message || "Failed to load runs");
    setLoadingRuns(false);
  }

  const selectedPipelineName = pipelines.find(p => p.id === selectedRuns)?.name ?? selectedRuns ?? "";
  const runsTitle = "Runs for " + selectedPipelineName;

  return (
    <div className="space-y-6">
      <RefetchIndicator active={isRefetching} />
      <SectionTitle title="DAG Pipelines" subtitle="Visual workflow engine with topological execution" action={<Button variant="primary" onClick={() => setShowCreate(true)}>+ Create Pipeline</Button>} />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonLoader key={i} variant="card" />)}
        </div>
      ) : pipelines.length === 0 ? (
        <EmptyState title="No pipelines" hint="Create a DAG pipeline to orchestrate multi-step agent workflows." />
      ) : (
        <div className="space-y-3">
          {pipelines.map(p => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={p.enabled ? "emerald" : "slate"}>{p.enabled ? "enabled" : "disabled"}</Badge>
                    <h3 className="text-sm font-semibold text-slate-100">{p.name}</h3>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{p.description || "No description"}</p>
                  <div className="mt-1 font-mono text-[10px] text-slate-600">{p.dag?.nodes?.length ?? 0} nodes · {p.dag?.edges?.length ?? 0} edges · by {p.author}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="primary" onClick={() => runPipeline(p.id)}>▶ Run</Button>
                  <Button size="sm" variant="ghost" onClick={() => viewRuns(p.id)}>runs</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedRuns && (
        <Card className="p-5">
          <SectionTitle title={runsTitle} subtitle="Recent execution history" action={<Button size="sm" variant="ghost" onClick={() => setSelectedRuns(null)}>close</Button>} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="pb-2">Status</th><th className="pb-2">Duration</th><th className="pb-2">Triggered by</th><th className="pb-2">Error</th>
              </tr></thead>
              <tbody>
                {loadingRuns && Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonLoader key={i} variant="table-row" />
                ))}
                {!loadingRuns && runs.map(r => (
                  <tr key={r.id} className="border-t border-nexus-border">
                    <td className="py-2"><Badge tone={r.status === "succeeded" ? "emerald" : "rose"}>{r.status}</Badge></td>
                    <td className="py-2 font-mono text-slate-500">{r.durationMs}ms</td>
                    <td className="py-2 text-slate-400">{r.triggeredBy}</td>
                    <td className="py-2 text-xs text-rose-400">{r.error || "—"}</td>
                  </tr>
                ))}
                {!loadingRuns && runs.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-slate-600">No runs yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setValidation(null); }} title="Create Pipeline" wide>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><Input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} placeholder="my-pipeline" /></Field>
            <Field label="Description"><Input value={createForm.description} onChange={e => setCreateForm({ ...createForm, description: e.target.value })} /></Field>
          </div>
          <Field label="DAG Definition (JSON)"><Textarea rows={10} value={createForm.dagJson} onChange={e => setCreateForm({ ...createForm, dagJson: e.target.value })} className="font-mono text-[10px]" /></Field>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={validate}>Validate DAG</Button>
            {validation && (
              <Badge tone={validation.ok ? "emerald" : "rose"}>
                {validation.ok ? "✓ Valid DAG" : `✗ ${validation.reason}`}
              </Badge>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => { setShowCreate(false); setValidation(null); }}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={!createForm.name}>Create Pipeline</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
