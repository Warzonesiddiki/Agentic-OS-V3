import { useRef, useState } from "react";
import { os, useOS } from "../../osStore";
import { nexus } from "../../store";
import { Badge, Button, Card, SectionTitle, cn } from "../../components/ui";
import { formatNumber } from "../../lib/core";

interface Line {
  kind: "in" | "out" | "ok" | "warn" | "err" | "hdr";
  text: string;
}

const HELP = `Commands:
  status                       system + OS summary
  recall "<query>"             token-budgeted recall
  remember --type T "title"    store a typed/flat memory
  context "<task>"             compact agent context (tier B)
  handoff create | accept latest
  dream run                    consolidation pass
  doctor                       diagnostics
  connect hermes               generate Hermes integration files
  connect <agent>              other: claude-code, codex, cursor, cline
  task spawn "<label>"         enqueue + tick

Hermes one-time setup:
  connect hermes               generates .mcp.json + nexus-os-context.md
  → Hermes auto-connects on every session after loading the context`;

export default function Cli() {
  const s = useOS();
  const [lines, setLines] = useState<Line[]>([{ kind: "hdr", text: "NEXUS CLI · type 'help' · agents run hooks automatically" }]);
  const [input, setInput] = useState("status");
  const sessionId = useRef<string | null>(null);
  const agent = s.agents[0];
  const log = (line: Line) => setLines((l) => [...l.slice(-200), line]);
  const out = (text: string) => log({ kind: "out", text });
  const ok = (text: string) => log({ kind: "ok", text });
  const warn = (text: string) => log({ kind: "warn", text });

  function runCommand(raw: string) {
    const line = raw.trim();
    log({ kind: "in", text: `$ ${line}` });
    if (!line) return;
    const [cmd, ...rest] = line.split(/\s+/);
    const argStr = rest.join(" ");
    switch (cmd) {
      case "help": out(HELP); break;
      case "status": {
        const ctx = os.compactContext();
        ok(`agents ${s.agents.length} · tasks ${s.tasks.length} · cards ${s.cards.length} · approvals ${s.approvals.filter((a) => a.status === "pending").length} pending`);
        out(`compact context: ${ctx.tokens} tokens (cap 800)`);
        break;
      }
      case "recall": {
        const q = argStr.replace(/^"|"$/g, "");
        const r = nexus.recall(q || "project", 1000);
        ok(`recall: ${r.returned.length} items · ${r.tokensUsed}/${r.tokenBudget} tokens · mode ${r.mode}`);
        r.returned.slice(0, 4).forEach((i) => out(`  [${i.type}] ${i.title} (score ${i.score.toFixed(2)})`));
        break;
      }
      case "remember": {
        const m = argStr.match(/--type\s+(\S+)\s+"([^"]*)"(?:\s+"([^"]*)")?/);
        if (!m) { warn('usage: remember --type project_fact "Title" "body"'); break; }
        const [, type, title, body] = m;
        if (["project_fact", "known_pitfall", "coding_convention", "user_preference"].includes(type)) {
          os.addCard({ type: type as never, title, summary: body || title });
          ok(`card stored: ${title}`);
        } else {
          nexus.createMemory({ kind: "semantic", title, content: body || title, tags: [], importance: 0.6, source: "cli", projectId: null });
          ok(`memory stored: ${title}`);
        }
        break;
      }
      case "context": {
        const task = argStr.replace(/^"|"$/g, "");
        const r = nexus.recall(task, 600);
        const ctx = os.compactContext();
        ok(`context for "${task}": ${r.returned.length} recalled · ambient ${ctx.tokens} tok`);
        out(ctx.text.split("\n").slice(0, 6).join("\n"));
        break;
      }
      case "handoff":
        if (rest[0] === "create") {
          const h = os.createHandoff(agent?.id ?? "cli");
          ok(`handoff ${h.id} created · next: ${h.nextBestStep}`);
        } else if (rest[0] === "accept") {
          const a = os.acceptHandoff("codex-local", rest[1] ?? "latest");
          ok(a.loaded ? "handoff accepted — context loaded" : a.context);
          out(a.context.split("\n").slice(0, 5).join("\n"));
        } else warn("usage: handoff create | accept latest");
        break;
      case "dream": {
        const d = os.dreamRun();
        ok(`dream: merged ${d.mergedDuplicates} · promoted ${d.promotedPreferences} · contradicted ${d.contradicted} · decayed ${d.decayed}`);
        break;
      }
      case "doctor": {
        const checks = os.runDoctor();
        const broken = checks.filter((c) => c.level === "broken").length;
        const warnN = checks.filter((c) => c.level === "warn").length;
        ok(`doctor: ${checks.length - broken - warnN} ok · ${warnN} warn · ${broken} broken`);
        checks.forEach((c) => out(`  ${c.level === "ok" ? "🟢" : c.level === "warn" ? "🟡" : "🔴"} ${c.name} — ${c.detail}`));
        break;
      }
      case "connect": {
        const agentName = rest[0] ?? "claude-code";
        const res = os.connectAgent(agentName);
        ok(`connector for ${res.agent}: ${res.files.map((f) => f.path).join(", ")}`);
        res.files.forEach((f) => out(`  ${f.path} (${formatNumber(f.content.length)} bytes)`));
        if (agentName === "hermes") {
          out("");
          out("Hermes setup:");
          out("  1. Copy .mcp.json to ~/.hermes/ or workspace root");
          out("  2. hermes personality load nexus-os-context.md");
          out("  3. Start hermes — auto-connects to NEXUS on every session");
        }
        break;
      }
      case "task": {
        if (rest[0] === "spawn") {
          const label = rest.slice(1).join(" ").replace(/^"|"$/g, "") || "cli task";
          os.enqueueTask(agent?.id ?? "system", label, "interactive");
          os.schedulerTick();
          ok(`task spawned + ticked`);
        }
        break;
      }
      default: warn(`unknown command: ${cmd} (try 'help')`);
    }
  }

  function runScenario() {
    setLines([{ kind: "hdr", text: "▶ Acceptance scenario: agent works, fails, hands off; new agent resumes" }]);
    const start = os.sessionStart(agent?.id ?? "cli", agent?.kind ?? "generic");
    sessionId.current = start.sessionId;
    out(`[session-start] ${start.sessionId.slice(0, 12)} · injected ${start.tokens} tok context`);
    os.hookUserPrompt(start.sessionId, "fix the failing build");
    const pre = os.hookPreToolUse(start.sessionId, "shell", { cmd: "npm run build" });
    out(`[pre-tool-use] npm run build → ${pre.decision?.allowed ? "allowed" : "gated: " + pre.decision?.reason}`);
    const post = os.hookPostToolUse(start.sessionId, "shell", { command: "npm run build", exitCode: 1, stderr: "Error: process.env.DATABASE_URL is required" });
    warn(`[post-tool-use] build failed → ${post.captured?.lesson ?? "captured"}`);
    const stop = os.hookStop(start.sessionId, "Remember to always set DATABASE_URL before build.");
    ok(`[stop] extracted ${stop.saved?.memories ?? 0} memories`);
    const end = os.hookSessionEnd(start.sessionId);
    ok(`[session-end] handoff ${end.handoff?.slice(0, 12)} created`);
    const acc = os.acceptHandoff("codex-local", "latest");
    ok(`[handoff-accept] codex-local resumed → ${acc.loaded ? "context loaded" : "none"}`);
    const checks = os.runDoctor();
    const broken = checks.filter((c) => c.level === "broken").length;
    ok(`[doctor] ${broken === 0 ? "✅ no broken checks" : `⚠ ${broken} broken`} — continuity achieved with zero manual MCP calls`);
  }

  const hookBtns: { label: string; fn: () => void }[] = [
    { label: "session-start", fn: () => { const r = os.sessionStart(agent?.id ?? "cli", agent?.kind ?? "generic"); sessionId.current = r.sessionId; out(`session-start → ${r.tokens} tok injected`); } },
    { label: "user-prompt", fn: () => { if (!sessionId.current) return warn("start a session first"); const r = os.hookUserPrompt(sessionId.current, "how to deploy"); out(r.injected ?? "no context"); } },
    { label: "pre-tool(rm -rf)", fn: () => { if (!sessionId.current) return warn("start a session first"); const r = os.hookPreToolUse(sessionId.current, "shell", { cmd: "rm -rf /" }); warn(`pre-tool: ${r.decision?.reason}`); } },
    { label: "post-tool(fail)", fn: () => { if (!sessionId.current) return warn("start a session first"); const r = os.hookPostToolUse(sessionId.current, "shell", { command: "npm test", exitCode: 1, stderr: "2 failed" }); warn(`post-tool: ${r.captured?.lesson ?? "captured"}`); } },
    { label: "pre-compact", fn: () => { if (!sessionId.current) return warn("start a session first"); const r = os.hookPreCompact(sessionId.current); out(r.injected ?? "snapshot"); } },
    { label: "stop", fn: () => { if (!sessionId.current) return warn("start a session first"); const r = os.hookStop(sessionId.current, "Note: prefer strict TS."); ok(`stop: ${r.saved?.memories ?? 0} memories`); } },
    { label: "session-end", fn: () => { if (!sessionId.current) return warn("start a session first"); const r = os.hookSessionEnd(sessionId.current); ok(`handoff ${r.handoff?.slice(0, 10)}`); sessionId.current = null; } },
  ];

  return (
    <div className="space-y-5">
      <SectionTitle title="CLI & Lifecycle Hooks" subtitle="A fast direct-CLI surface + the hook events that make agents smarter automatically" />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-nexus-border px-3 py-2">
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /><span className="ml-2 font-mono text-[11px] text-slate-500">nexus@agent-os</span></div>
            <Button size="sm" variant="primary" onClick={runScenario}>▶ Run acceptance scenario</Button>
          </div>
          <div className="h-[420px] overflow-y-auto bg-slate-950/80 p-3 font-mono text-[12px] leading-relaxed">
            {lines.map((l, i) => (
              <div key={i} className={cn("whitespace-pre-wrap break-words",
                l.kind === "in" && "text-cyan-300",
                l.kind === "out" && "text-slate-400",
                l.kind === "ok" && "text-emerald-300",
                l.kind === "warn" && "text-amber-300",
                l.kind === "err" && "text-rose-300",
                l.kind === "hdr" && "text-violet-300")}>{l.text}</div>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); runCommand(input); setInput(""); }} className="flex items-center gap-2 border-t border-nexus-border px-3 py-2">
            <span className="font-mono text-cyan-400">nexus ❯</span>
            <input value={input} onChange={(e) => setInput(e.target.value)} className="flex-1 bg-transparent font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600" placeholder="help · status · recall …" />
            <Button size="sm" variant="outline" type="submit">run</Button>
          </form>
        </Card>

        <Card className="p-4">
          <SectionTitle title="Hooks" subtitle="Fire lifecycle events" />
          <div className="mt-3 space-y-1.5">
            {hookBtns.map((b) => (
              <Button key={b.label} variant="outline" className="w-full justify-start font-mono text-xs" onClick={b.fn}>{b.label}</Button>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-nexus-border bg-slate-950/40 p-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Active session</div>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone={sessionId.current ? "emerald" : "slate"}>{sessionId.current ? "live" : "none"}</Badge>
              <span className="font-mono text-[10px] text-slate-600">{sessionId.current?.slice(0, 16) ?? "—"}</span>
            </div>
            <div className="mt-1 font-mono text-[10px] text-slate-600">observations: {s.observations.length} · handoffs: {s.handoffs.length}</div>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">Hooks inject context, gate risky tools, capture observations, and distill sessions — so memory works even when the LLM forgets to call tools.</p>
        </Card>
      </div>
    </div>
  );
}
