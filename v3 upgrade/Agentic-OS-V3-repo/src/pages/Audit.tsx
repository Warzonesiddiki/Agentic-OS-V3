import { useMemo, useState, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { nexus, useNexus } from "../store";
import { Badge, Card, SectionTitle, Select } from "../components/ui";
import { formatCompact, formatDateTime, shortHash, timeAgo } from "../lib/core";

export default function Audit() {
  const s = useNexus();
  const [filter, setFilter] = useState("");
  const verify = nexus.verifyAudit();
  const totalSaved = s.ledger.reduce((a, e) => a + e.tokensSaved, 0);

  const actions = useMemo(() => Array.from(new Set(s.audit.map((e) => e.action))).sort(), [s.audit]);
  const entries = useMemo(
    () => [...s.audit].reverse().filter((e) => !filter || e.action === filter),
    [s.audit, filter]
  );
  const ledger = [...s.ledger].reverse().slice(0, 12);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });
  const maxSaved = Math.max(1, ...s.ledger.map((e) => e.tokensSaved));

  return (
    <div className="space-y-5">
      <SectionTitle title="Audit & ledger" subtitle="Append-only, hash-chained, tamper-evident history" />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Chain integrity</div>
          <div className="mt-1 flex items-center gap-2">
            <Badge tone={verify.valid ? "emerald" : "rose"}>{verify.valid ? "VALID" : "BROKEN"}</Badge>
            <span className="font-mono text-sm text-slate-200">{verify.verifiedEntries} verified</span>
          </div>
          {verify.brokenAt && <div className="mt-1 text-[11px] text-rose-300">Broken at sequence #{verify.brokenAt}</div>}
        </Card>
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Tokens saved</div>
          <div className="mt-1 font-mono text-2xl text-emerald-300">{formatCompact(totalSaved)}</div>
          <div className="text-[11px] text-slate-500">reused vs re-derived</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Events</div>
          <div className="mt-1 font-mono text-2xl text-slate-200">{s.audit.length}</div>
          <div className="text-[11px] text-slate-500">audit · {s.ledger.length} ledger</div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <SectionTitle title="Audit chain" action={
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-52">
              <option value="">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          } />
          <div ref={parentRef} className="overflow-auto" style={{ maxHeight: "480px" }}>
            <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
              {virtualizer.getVirtualItems().map((v) => {
                const e = entries[v.index];
                if (!e) return null;
                return (
                  <div
                    key={e.id}
                    className="absolute left-0 right-0 flex items-center gap-3 rounded-lg border border-nexus-border bg-slate-950/40 px-3 py-1.5"
                    style={{ height: `${v.size}px`, transform: `translateY(${v.start}px)` }}
                  >
                    <span className="w-8 shrink-0 font-mono text-[10px] text-slate-600">#{e.sequence}</span>
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-xs text-slate-200">{e.action}</span>
                      <span className="ml-2 text-[10px] text-slate-600">{e.actor}</span>
                    </div>
                    <span className="hidden font-mono text-[9px] text-slate-700 sm:inline" title={e.prevHash}>← {shortHash(e.prevHash, 6)}</span>
                    <span className="font-mono text-[9px] text-cyan-500/70" title={e.entryHash}>{shortHash(e.entryHash, 8)}</span>
                    <span className="hidden font-mono text-[9px] text-slate-600 md:inline">{timeAgo(e.createdAt)}</span>
                  </div>
                );
              })}
            </div>
            {!entries.length && <div className="py-8 text-center text-xs text-slate-600">No audit entries.</div>}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle title="Token ledger" subtitle="recent savings" />
          <div className="mt-3 space-y-1.5">
            {ledger.map((e) => (
              <div key={e.id} className="rounded-lg border border-nexus-border bg-slate-950/40 px-2.5 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-slate-300">{e.eventType}</span>
                  <Badge tone="emerald">+{e.tokensSaved} tok</Badge>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-emerald-400/70" style={{ width: `${(e.tokensSaved / maxSaved) * 100}%` }} />
                </div>
                <div className="mt-0.5 truncate font-mono text-[9px] text-slate-600">{e.query || "—"} · {formatDateTime(e.createdAt)}</div>
              </div>
            ))}
            {!ledger.length && <div className="py-8 text-center text-xs text-slate-600">No ledger entries. Run a recall.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
