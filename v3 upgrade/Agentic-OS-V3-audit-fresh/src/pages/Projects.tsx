import { useState } from "react";
import { nexus, useNexus } from "../store";
import { Badge, Button, Card, EmptyState, Field, Input, SectionTitle, Textarea } from "../components/ui";
import { formatCompact, timeAgo } from "../lib/core";
import type { TransferInput } from "../lib/types";
import type { TransferReport } from "../lib/operations";

export default function Projects() {
  const s = useNexus();
  const [projectName, setProjectName] = useState("legacy-platform");
  const [description, setDescription] = useState("");
  const [memText, setMemText] = useState("Always use connection pooling | Database pool max should be configurable and bounded.\nCache invalidation is hard | Prefer explicit cache keys over TTL-only invalidation.");
  const [skillText, setSkillText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [report, setReport] = useState<TransferReport | null>(null);

  function transfer() {
    const memories = memText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [title, ...rest] = l.split("|");
        return { kind: "semantic" as const, title: title.trim(), content: rest.join("|").trim() || title.trim(), tags: [], importance: 0.6, source: "manual" };
      });
    const skills = skillText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name, title, description, ...rest] = l.split("|");
        return { name: name.trim(), title: (title || name).trim(), description: (description || "Transferred skill").trim(), content: rest.join("|").trim() || description?.trim() || "", category: "general", tags: [], trigger: null, source: "transfer", projectId: null };
      });
    const input: TransferInput = {
      projectName,
      description: description || undefined,
      memories,
      skills,
      transcript: transcript || undefined,
      files: [],
    };
    setReport(nexus.transfer(input));
  }

  return (
    <div className="space-y-5">
      <SectionTitle title="Knowledge transfer" subtitle="Import lessons from a previous project, deduplicated & audited" />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project name"><Input value={projectName} onChange={(e) => setProjectName(e.target.value)} /></Field>
            <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          </div>
          <Field label="Memories" hint="one per line: title | content"><Textarea rows={5} value={memText} onChange={(e) => setMemText(e.target.value)} /></Field>
          <Field label="Skills" hint="name | title | desc | content"><Textarea rows={3} value={skillText} onChange={(e) => setSkillText(e.target.value)} /></Field>
          <Field label="Transcript (optional)"><Textarea rows={3} value={transcript} onChange={(e) => setTranscript(e.target.value)} /></Field>
          <Button variant="primary" onClick={transfer} disabled={!projectName.trim()}>Transfer knowledge</Button>
        </Card>

        <div className="space-y-5">
          <Card className="p-4">
            <SectionTitle title="Transfer report" />
            {!report ? (
              <div className="py-10 text-center text-xs text-slate-600">Run a transfer to see the deduped report.</div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Metric label="Project" value={report.projectName} sub={report.created ? "created" : "existing"} />
                <Metric label="Footprint" value={formatCompact(report.tokenFootprint)} sub="tokens" />
                <Metric label="Memories created" value={String(report.memoriesCreated)} sub="deduped" />
                <Metric label="Skipped (dupes)" value={String(report.memoriesSkipped)} />
                <Metric label="Skills upserted" value={String(report.skillsUpserted)} />
              </div>
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle title="Projects" subtitle={`${s.projects.length} tracked`} />
            {s.projects.length === 0 ? (
              <EmptyState title="No projects yet" />
            ) : (
              <div className="mt-3 space-y-2">
                {s.projects.map((p) => (
                  <div key={p.id} className="rounded-lg border border-nexus-border bg-slate-950/40 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{p.name}</span>
                      <Badge tone={p.status === "active" ? "emerald" : "slate"}>{p.status}</Badge>
                      <span className="ml-auto font-mono text-[10px] text-slate-600">{formatCompact(p.tokenFootprint)} tok · {timeAgo(p.updatedAt)}</span>
                    </div>
                    {p.description && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{p.description}</p>}
                    <div className="mt-1 flex gap-3 font-mono text-[10px] text-slate-600">{p.memoryCount} memories · {p.skillCount} skills</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-nexus-border bg-slate-950/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-slate-100">{value}</div>
      {sub && <div className="text-[10px] text-slate-600">{sub}</div>}
    </div>
  );
}
