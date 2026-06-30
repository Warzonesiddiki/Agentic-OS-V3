import { useState } from "react";
import { os, useOS } from "../../osStore";
import { Badge, Button, Card, CodeBlock, SectionTitle } from "../../components/ui";
import type { DoctorCheck, DriftResult } from "../../lib/os/types";
import { timeAgo } from "../../lib/core";

export default function Dream() {
  const s = useOS();
  const [checks, setChecks] = useState<DoctorCheck[] | null>(null);
  const [drift, setDrift] = useState<DriftResult[] | null>(null);

  function dream() {
    const d = os.dreamRun();
    setChecks(os.runDoctor());
    setDrift(os.runVerify());
    return d;
  }

  const levelIcon = (l: DoctorCheck["level"]) => (l === "ok" ? "🟢" : l === "warn" ? "🟡" : "🔴");
  const sevTone = (sv: DriftResult["severity"]) => (sv === "info" ? "emerald" : sv === "warn" ? "amber" : "rose");

  return (
    <div className="space-y-5">
      <SectionTitle title="Dream & Doctor" subtitle="Background consolidation + self-diagnostics against live state"
        action={<Button variant="primary" onClick={dream}>▶ Run dream pass</Button>} />

      <Card className="p-4">
        <SectionTitle title="Dream consolidation" subtitle="Deterministic, capped (≤500 memories / ≤20 sessions) · no LLM required" />
        {s.dreamLog.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-600">No dream passes yet. Run one to merge duplicates, promote preferences, detect contradictions, and decay stale cards.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {s.dreamLog.slice(0, 4).map((d) => (
              <div key={d.id} className="rounded-lg border border-nexus-border bg-slate-950/40 p-3">
                <div className="flex items-center gap-2">
                  <Badge tone="violet">dream</Badge>
                  <span className="font-mono text-[10px] text-slate-600">{timeAgo(d.createdAt)}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Cell k="merged" v={d.mergedDuplicates} />
                  <Cell k="promoted" v={d.promotedPreferences} />
                  <Cell k="contradicted" v={d.contradicted} />
                  <Cell k="decayed" v={d.decayed} />
                  <Cell k="sessions" v={d.consolidatedSessions} />
                </div>
                <CodeBlock className="mt-2">{d.digest.join("\n")}</CodeBlock>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle title="Doctor" subtitle="Real checks against live engine state" action={<Button size="sm" variant="outline" onClick={() => setChecks(os.runDoctor())}>re-run</Button>} />
          <div className="mt-3 space-y-1">
            {(checks ?? []).map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded border border-nexus-border bg-slate-950/40 px-2 py-1.5">
                <span>{levelIcon(c.level)}</span>
                <span className="text-xs text-slate-200">{c.name}</span>
                <span className="ml-auto font-mono text-[10px] text-slate-500">{c.detail}</span>
              </div>
            ))}
            {!checks && <div className="py-6 text-center text-xs text-slate-600">Run doctor to see live diagnostics.</div>}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle title="Drift verification" subtitle="Detect integrity, context, policy, config drift" action={<Button size="sm" variant="outline" onClick={() => setDrift(os.runVerify())}>re-run</Button>} />
          <div className="mt-3 space-y-2">
            {(drift ?? []).map((d, i) => (
              <div key={i} className="rounded-lg border border-nexus-border bg-slate-950/40 p-2">
                <div className="flex items-center gap-2">
                  <Badge tone={sevTone(d.severity)}>{d.area}</Badge>
                  <Badge tone={sevTone(d.severity)}>{d.severity}</Badge>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">expected <span className="font-mono text-slate-300">{d.expected}</span> · actual <span className="font-mono text-slate-300">{d.actual}</span></div>
                <div className="text-[11px] text-cyan-300">→ {d.recommendation}</div>
              </div>
            ))}
            {!drift && <div className="py-6 text-center text-xs text-slate-600">Run verification to detect drift.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Cell({ k, v }: { k: string; v: number }) {
  return (
    <div className="rounded border border-nexus-border bg-slate-950/40 p-2 text-center">
      <div className="font-mono text-lg text-slate-100">{v}</div>
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{k}</div>
    </div>
  );
}
