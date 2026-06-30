import { useState } from "react";
import { os, useOS } from "../../osStore";
import { Badge, Button, Card, CodeBlock, EmptyState, Field, Input, Modal, SectionTitle, Select, Stat, Textarea, cn } from "../../components/ui";
import { MEMORY_TYPES, type MemoryCard, type MemoryType, type Stability } from "../../lib/os/types";
import { formatNumber } from "../../lib/core";

const STABILITY_TONE: Record<Stability, "slate" | "emerald" | "amber" | "rose"> = {
  draft: "slate", confirmed: "emerald", deprecated: "amber", contradicted: "rose",
};

export default function Graph() {
  const s = useOS();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MemoryType>("project_fact");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [entities, setEntities] = useState("");
  const [importance, setImportance] = useState(0.6);
  const [query, setQuery] = useState("build");
  const [recall, setRecall] = useState<ReturnType<typeof os.doGraphRecall> | null>(null);

  function add() {
    if (!title.trim()) return;
    os.addCard({ type, title, summary: summary || title, entities: entities.split(",").map((e) => e.trim()).filter(Boolean), importance });
    setOpen(false);
    setTitle(""); setSummary(""); setEntities(""); setImportance(0.6);
  }

  const confirmed = s.cards.filter((c) => c.stability === "confirmed").length;
  const contradicted = s.cards.filter((c) => c.stability === "contradicted").length;

  return (
    <div className="space-y-5">
      <SectionTitle title="Typed Memory Graph" subtitle="Evidence · confidence · stability · decay · contradictions · edges"
        action={<Button variant="primary" onClick={() => setOpen(true)}>+ New card</Button>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cards" value={formatNumber(s.cards.length)} tone="violet" />
        <Stat label="Confirmed" value={formatNumber(confirmed)} tone="emerald" />
        <Stat label="Contradicted" value={formatNumber(contradicted)} tone="rose" />
        <Stat label="Edges" value={formatNumber(s.edges.length)} tone="cyan" />
      </div>

      <Card className="p-4">
        <SectionTitle title="Graph recall" subtitle="Decayed, confidence-weighted, contradiction-penalized · one-hop expansion" />
        <div className="mt-3 flex items-center gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1" placeholder="build, tests, env…" />
          <Button variant="primary" onClick={() => setRecall(os.doGraphRecall(query, 800))}>Recall</Button>
        </div>
        {recall && (
          <div className="mt-3 space-y-2">
            <div className="font-mono text-[10px] text-slate-500">{recall.items.length} cards · {recall.tokens} tokens · expanded: {recall.expanded.length} nodes</div>
            {recall.items.map((c) => <CardMini key={c.id} c={c} expanded={recall.expanded.includes(c.id)} />)}
          </div>
        )}
      </Card>

      {s.cards.length === 0 ? (
        <EmptyState title="No memory cards" hint="Create a typed card to begin the graph." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {s.cards.map((c) => <CardMini key={c.id} c={c} full actions />)}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New memory card">
        <div className="space-y-3">
          <Field label="Type"><Select value={type} onChange={(e) => setType(e.target.value as MemoryType)}>{MEMORY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
          <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Summary"><Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
          <Field label="Entities" hint="comma separated"><Input value={entities} onChange={(e) => setEntities(e.target.value)} placeholder="build, env" /></Field>
          <Field label={`Importance · ${importance.toFixed(2)}`}><input type="range" min={0} max={1} step={0.05} value={importance} onChange={(e) => setImportance(Number(e.target.value))} className="w-full accent-cyan-500" /></Field>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={add} disabled={!title.trim()}>Create</Button></div>
        </div>
      </Modal>
    </div>
  );
}

function CardMini({ c, full, actions, expanded }: { c: MemoryCard; full?: boolean; actions?: boolean; expanded?: boolean }) {
  const decay = Math.pow(0.5, (Date.now() - c.updatedAt) / (c.decayHalfLifeDays * 86400000));
  return (
    <Card className={cn("p-3", expanded && "ring-1 ring-cyan-500/40")}>
      <div className="flex items-center gap-2">
        <Badge tone="violet">{c.type}</Badge>
        <Badge tone={STABILITY_TONE[c.stability]}>{c.stability}</Badge>
        {expanded && <Badge tone="cyan">hop</Badge>}
      </div>
      <div className="mt-1 text-sm font-medium text-slate-100">{c.title}</div>
      {full && <p className="mt-1 text-xs text-slate-400">{c.summary}</p>}
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Meter label="confidence" value={c.confidence} tone="bg-cyan-400" />
        <Meter label="importance" value={c.importance} tone="bg-emerald-400" />
        <Meter label="decay" value={decay} tone="bg-violet-400" />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {c.evidence.length > 0 && <span className="font-mono text-[9px] text-slate-500">{c.evidence.length} evidence</span>}
        {c.entities.map((e) => <span key={e} className="font-mono text-[9px] text-slate-600">@{e}</span>)}
        {actions && (
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => os.verifyCard(c.id)}>verify</Button>
            <Button size="sm" variant="ghost" onClick={() => os.setCardStability(c.id, "confirmed")}>confirm</Button>
            <Button size="sm" variant="ghost" className="text-amber-300" onClick={() => os.setCardStability(c.id, "deprecated")}>deprecate</Button>
            <Button size="sm" variant="ghost" className="text-rose-300" onClick={() => os.setCardStability(c.id, "contradicted")}>contradict</Button>
          </div>
        )}
      </div>
      {actions && c.evidence.length > 0 && (
        <details className="mt-2"><summary className="cursor-pointer text-[10px] text-slate-500">evidence</summary>
          <CodeBlock className="mt-1 max-h-32">{c.evidence.map((e) => `[${e.source}] ${e.command ?? e.quote ?? ""} ${e.exitCode != null ? `(exit ${e.exitCode})` : ""}`).join("\n")}</CodeBlock>
        </details>
      )}
    </Card>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="h-1 overflow-hidden rounded-full bg-slate-800"><div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.round(value * 100)}%` }} /></div>
      <div className="mt-0.5 font-mono text-[9px] text-slate-600">{label} {value.toFixed(2)}</div>
    </div>
  );
}
