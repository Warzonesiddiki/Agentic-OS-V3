import { useState } from "react";
import { nexus, useNexus } from "../store";
import { Badge, Button, Card, EmptyState, SectionTitle } from "../components/ui";
import { cn } from "../components/ui";
import type { RecallItem, RecallResult } from "../lib/types";

const TYPE_TONE = { memory: "violet", skill: "cyan", note: "emerald" } as const;

export default function Recall() {
  useNexus(); // subscribe so recallCount updates reflect
  const [q, setQ] = useState("how should I rank search results?");
  const [budget, setBudget] = useState(1500);
  const [result, setResult] = useState<RecallResult | null>(null);
  const [voted, setVoted] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  function run() {
    if (!q.trim()) return;
    setResult(nexus.recall(q.trim(), budget));
    setVoted({});
    setExpanded(null);
  }

  function vote(item: RecallItem, helpful: boolean) {
    nexus.feedback(q.trim(), item.id, item.type, helpful);
    setVoted({ ...voted, [item.id]: helpful });
  }

  return (
    <div className="space-y-5">
      <SectionTitle title="Recall" subtitle="Token-budgeted unified retrieval across memories, skills & notes" />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-300">Query</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              className="w-full rounded-lg border border-nexus-border bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30"
              placeholder="Ask the brain…"
            />
          </div>
          <div className="w-56">
            <label className="mb-1 block text-xs font-medium text-slate-300">Token budget · {budget}</label>
            <input type="range" min={128} max={4096} step={64} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="w-full accent-cyan-500" />
          </div>
          <Button variant="primary" onClick={run}>Run recall</Button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Ranking = 0.6·lexical(BM25) + 0.25·importance + 0.10·recency + feedback. Results are greedily packed under budget.
        </p>
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Mode" value={result.mode} />
            <MiniStat label="Returned" value={String(result.returned.length)} />
            <MiniStat label="Tokens used" value={`${result.tokensUsed}/${result.tokenBudget}`} />
            <MiniStat label="Truncated" value={String(result.truncated)} />
          </div>

          {result.returned.length === 0 ? (
            <EmptyState title="No matching items" hint="Try a broader query or add more memories." />
          ) : (
            <div className="space-y-2">
              {result.returned.map((item, i) => (
                <Card key={item.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 font-mono text-xs text-slate-600">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge tone={TYPE_TONE[item.type]}>{item.type}</Badge>
                        <button onClick={() => setExpanded(expanded === item.id ? null : item.id)} className="truncate text-left text-sm font-medium text-slate-100 hover:text-cyan-300">
                          {item.title}
                        </button>
                        <span className="ml-auto font-mono text-[10px] text-slate-500">score {item.score.toFixed(3)} · {item.tokenCost} tok</span>
                      </div>
                      <p className={cn("mt-1 text-xs leading-relaxed text-slate-400", expanded === item.id ? "" : "line-clamp-2")}>{item.content}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-slate-600">Relevant?</span>
                        <Button size="sm" variant={voted[item.id] === true ? "primary" : "outline"} onClick={() => vote(item, true)}>👍 yes</Button>
                        <Button size="sm" variant={voted[item.id] === false ? "danger" : "outline"} onClick={() => vote(item, false)}>👎 no</Button>
                        {voted[item.id] !== undefined && <span className="text-[10px] text-slate-500">feedback recorded</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-slate-200">{value}</div>
    </Card>
  );
}
