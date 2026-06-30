import { useState } from "react";
import { nexus } from "../store";
import { Badge, Button, Card, CodeBlock, Field, Input, SectionTitle, Textarea, cn } from "../components/ui";
import type { CaptureReport } from "../lib/operations";

const SAMPLE = `We decided to always validate API input with Zod at every boundary.
Lesson learned: never commit .next or dist to git.
TODO: add rate limiting before exposing the recall endpoint publicly.
Remember the team prefers strict TypeScript with no any.
The auth layer must use constant-time comparison for secrets.`;

export default function Sessions() {
  const [transcript, setTranscript] = useState(SAMPLE);
  const [projectName, setProjectName] = useState("");
  const [forceFail, setForceFail] = useState(false);
  const [report, setReport] = useState<CaptureReport | null>(null);

  function capture() {
    setReport(nexus.capture({ transcript, projectName: projectName || undefined, forceFail }));
  }

  return (
    <div className="space-y-5">
      <SectionTitle title="Session capture" subtitle="Distill a transcript into durable memories & skills" />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <Field label="Transcript" hint="never lost on failure">
            <Textarea rows={12} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project (optional)"><Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="acme-rewrite" /></Field>
            <Field label="Safety invariant test">
              <label className="flex h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-nexus-border bg-slate-950/60 px-3 text-xs text-slate-300">
                <input type="checkbox" checked={forceFail} onChange={(e) => setForceFail(e.target.checked)} className="accent-rose-500" />
                Force distillation failure
              </label>
            </Field>
          </div>
          <Button variant="primary" onClick={capture} disabled={!transcript.trim()}>Capture session</Button>
          <p className="text-[11px] text-slate-500">
            If distillation fails, the raw transcript is <span className="text-emerald-300">always</span> preserved as an undistilled checkpoint memory — this invariant is the core reliability guarantee.
          </p>
        </Card>

        <Card className="p-4">
          <SectionTitle title="Result" subtitle="Exactly what was persisted" />
          {!report ? (
            <div className="py-12 text-center text-xs text-slate-600">Run a capture to see the distilled output.</div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className={cn("flex items-center gap-2 rounded-lg border p-3", report.transcriptPreserved ? "border-emerald-500/40 bg-emerald-500/10" : "border-cyan-500/40 bg-cyan-500/10")}>
                <span className="text-lg">{report.transcriptPreserved ? "🛡️" : "✨"}</span>
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    {report.distilled ? `Distilled into ${report.savedMemories.length} memories` : "Transcript preserved (undistilled)"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {report.transcriptPreserved ? "Invariant held — raw transcript saved as a checkpoint memory." : "Heuristic distillation succeeded."}
                  </div>
                </div>
              </div>

              {report.reason && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 font-mono text-[11px] text-rose-300">{report.reason}</div>
              )}

              <div className="flex flex-wrap gap-2 text-[11px]">
                <Badge tone="violet">{report.savedMemories.length} memories</Badge>
                <Badge tone="cyan">{report.savedSkills.length} skills</Badge>
                <Badge tone={report.transcriptPreserved ? "emerald" : "slate"}>{report.transcriptPreserved ? "transcript preserved" : "transcript consumed"}</Badge>
              </div>

              <div className="space-y-1.5">
                {report.savedMemories.map((m) => (
                  <div key={m.id} className="rounded-lg border border-nexus-border bg-slate-950/40 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Badge tone="violet">{m.kind}</Badge>
                      <span className="truncate text-xs text-slate-200">{m.title}</span>
                      <span className="ml-auto font-mono text-[10px] text-slate-600">{m.tokenCost} tok</span>
                    </div>
                  </div>
                ))}
              </div>

              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-slate-500">Raw transcript ({report.transcript.length} chars)</summary>
                <CodeBlock className="mt-1 max-h-40">{report.transcript}</CodeBlock>
              </details>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
