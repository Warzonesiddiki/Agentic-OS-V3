import { useState, useSyncExternalStore } from "react";
import { LOCAL_KEY, nexus, useConfig, useNexus } from "../store";
import { os } from "../osStore";
import { setConfig, validateConfig, type RuntimeConfig } from "../lib/config";
import { getRemote, setRemote, remote as remoteApi, subscribeRemote } from "../lib/remote";
import { Badge, Button, Card, Field, Input, SectionTitle, Select } from "../components/ui";
import { SCOPES } from "../lib/types";
import { toast } from "../lib/toast";

export default function Settings() {
  const cfg = useConfig();
  const s = useNexus();
  const [draft, setDraft] = useState<RuntimeConfig>({ ...cfg });
  const [copied, setCopied] = useState(false);
  const issues = validateConfig();

  function save() {
    setConfig({
      nodeEnv: draft.nodeEnv,
      allowedOrigins: draft.allowedOrigins,
      rateLimitPerMinute: Number(draft.rateLimitPerMinute),
      maxBodyBytes: Number(draft.maxBodyBytes),
      llmBaseUrl: draft.llmBaseUrl,
      llmApiKey: draft.llmApiKey,
      llmModel: draft.llmModel,
      embeddingModel: draft.embeddingModel,
      obsidianVault: draft.obsidianVault,
    });
  }

  function copyKey() {
    navigator.clipboard?.writeText(LOCAL_KEY).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="space-y-5">
      <SectionTitle title="Settings" subtitle="Runtime configuration, principals & danger zone" />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <SectionTitle title="Environment" subtitle="Simulated .env — persisted & validated" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Node env">
              <Select value={draft.nodeEnv} onChange={(e) => setDraft({ ...draft, nodeEnv: e.target.value as RuntimeConfig["nodeEnv"] })}>
                <option value="development">development</option>
                <option value="production">production</option>
              </Select>
            </Field>
            <Field label="Port"><Input type="number" value={draft.port} onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) })} disabled /></Field>
            <Field label="Allowed origins"><Input value={draft.allowedOrigins} onChange={(e) => setDraft({ ...draft, allowedOrigins: e.target.value })} /></Field>
            <Field label="Rate limit / min"><Input type="number" value={draft.rateLimitPerMinute} onChange={(e) => setDraft({ ...draft, rateLimitPerMinute: Number(e.target.value) })} /></Field>
            <Field label="Max body bytes"><Input type="number" value={draft.maxBodyBytes} onChange={(e) => setDraft({ ...draft, maxBodyBytes: Number(e.target.value) })} /></Field>
            <Field label="Obsidian vault"><Input value={draft.obsidianVault} onChange={(e) => setDraft({ ...draft, obsidianVault: e.target.value })} placeholder="/abs/path/to/vault" /></Field>
          </div>
          <div className="rounded-lg border border-nexus-border bg-slate-950/40 p-2 text-[11px] text-slate-400">
            <div className="mb-1 font-medium text-slate-300">LLM provider (optional)</div>
            <div className="grid grid-cols-2 gap-2">
              <Input value={draft.llmBaseUrl} onChange={(e) => setDraft({ ...draft, llmBaseUrl: e.target.value })} placeholder="base url" className="font-mono" />
              <Input value={draft.llmModel} onChange={(e) => setDraft({ ...draft, llmModel: e.target.value })} placeholder="model" className="font-mono" />
              <Input value={draft.llmApiKey} onChange={(e) => setDraft({ ...draft, llmApiKey: e.target.value })} placeholder="api key" type="password" className="font-mono" />
              <Input value={draft.embeddingModel} onChange={(e) => setDraft({ ...draft, embeddingModel: e.target.value })} placeholder="embedding model" className="font-mono" />
            </div>
          </div>
          <Button variant="primary" onClick={save}>Save configuration</Button>

          <div className="space-y-1">
            <div className="text-[11px] font-medium text-slate-400">Validation</div>
            {issues.length === 0 ? (
              <Badge tone="emerald">no issues</Badge>
            ) : (
              issues.map((i, k) => (
                <div key={k} className={`rounded border px-2 py-1 text-[11px] ${i.level === "fatal" ? "border-rose-500/30 bg-rose-500/5 text-rose-300" : "border-amber-500/30 bg-amber-500/5 text-amber-300"}`}>
                  <span className="font-mono">{i.field}</span> · {i.message}
                </div>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-4">
            <SectionTitle title="Local operator key" subtitle="Auto-authenticated in this UI" />
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-nexus-border bg-slate-950/60 px-3 py-2 font-mono text-[11px] text-cyan-300">{LOCAL_KEY}</code>
              <Button variant="outline" onClick={copyKey}>{copied ? "copied ✓" : "copy"}</Button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Use this as <code className="font-mono">Authorization: Bearer …</code> in the API Console or any MCP client.</p>
          </Card>

          <Card className="p-4">
            <SectionTitle title="Principals" subtitle="API keys are stored hashed only" />
            <div className="mt-3 space-y-2">
              {s.principals.map((p) => (
                <div key={p.id} className="rounded-lg border border-nexus-border bg-slate-950/40 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{p.name}</span>
                    <Badge tone={p.status === "active" ? "emerald" : "slate"}>{p.status}</Badge>
                    <span className="ml-auto font-mono text-[10px] text-slate-600">…{p.keyPreview}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {SCOPES.filter((sc) => p.scopes.includes(sc)).map((sc) => (
                      <span key={sc} className="rounded border border-slate-700 bg-slate-900/60 px-1 font-mono text-[9px] text-slate-400">{sc}</span>
                    ))}
                  </div>
                  <div className="mt-1 font-mono text-[9px] text-slate-600">hash: {p.keyHash.slice(0, 16)}… · last used {p.lastUsedAt ? new Date(p.lastUsedAt).toLocaleTimeString() : "never"}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <SectionTitle title="Backup & restore" subtitle="Full backup = brain + OS graph (typed cards, agents, handoffs)" />
            <BackupRestore />
          </Card>

          <Card className="p-4">
            <SectionTitle title="Remote server" subtitle="Connect the dashboard to a NEXUS 2.0 backend (one system)" />
            <RemotePanel />
          </Card>

          <Card className="border-rose-500/30 p-4">
            <SectionTitle title="Danger zone" subtitle="Irreversible brain operations" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" className="border-amber-500/40 text-amber-300" onClick={() => { if (toast.confirm("Reseed the brain with sample data? Current data is replaced.")) { nexus.reset(); toast.success("Brain reseeded."); } }}>Reseed brain</Button>
              <Button variant="danger" onClick={() => { if (toast.confirm("Wipe ALL memories, skills, notes? This cannot be undone.")) { nexus.wipe(); toast.success("Brain wiped."); } }}>Wipe everything</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function BackupRestore() {
  const [msg, setMsg] = useState<string | null>(null);
  const ps = nexus.getPersistenceStatus();

  function fullBackup() {
    const payload = {
      format: "nexus-full",
      version: 1,
      exportedAt: Date.now(),
      brain: nexus.exportBrain(),
      os: os.exportOS(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexus-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Full backup downloaded (brain + OS graph).");
  }

  function restore(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const b = nexus.importBrain(data.brain ?? data);
        const o = data.os ? os.importOS(data.os) : { cards: 0, agents: 0 };
        setMsg(`Restored: ${b.memories} memories, ${b.skills} skills, ${o.cards} cards, ${o.agents} agents (${b.duplicates} dupes skipped).`);
      } catch (e) {
        setMsg(`Restore failed: ${e instanceof Error ? e.message : "invalid file"}`);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-lg border border-nexus-border bg-slate-950/40 p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Persistence health</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
          <Badge tone={ps.lastWriteOk ? "emerald" : "rose"}>{ps.lastWriteOk ? "writes OK" : "write failing"}</Badge>
          <Badge tone={ps.corruptionRecovered ? "amber" : "slate"}>{ps.corruptionRecovered ? "recovered from corruption" : "no corruption"}</Badge>
          <span className="font-mono text-slate-500">quota events: {ps.quotaEvents}</span>
        </div>
        {ps.lastError && <div className="mt-1.5 rounded border border-rose-500/30 bg-rose-500/5 p-2 font-mono text-[10px] text-rose-300">{ps.lastError}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={fullBackup}>⬇ Download full backup</Button>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-nexus-border bg-slate-800/70 px-3.5 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700/70">
          ⬆ Restore from file
          <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
        </label>
      </div>
      {msg && <div className="rounded border border-cyan-500/30 bg-cyan-500/5 p-2 text-[11px] text-cyan-300">{msg}</div>}
    </div>
  );
}

function RemotePanel() {
  const rc = useSyncExternalStore(subscribeRemote, getRemote, getRemote);
  const [ping, setPing] = useState<{ ok: boolean; status?: string; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function test() {
    setTesting(true);
    setPing(await remoteApi.ping());
    setTesting(false);
  }

  return (
    <div className="mt-3 space-y-3">
      <p className="text-[11px] text-slate-500">
        By default this dashboard runs its own in-browser engine. Enable a remote server to make the UI
        talk to a real NEXUS backend over the typed REST API (same origin when the server serves this UI).
      </p>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={rc.enabled} onChange={(e) => setRemote({ enabled: e.target.checked })} className="accent-cyan-500" />
        Connect to a remote NEXUS server
      </label>
      <div className="grid grid-cols-1 gap-3">
        <Field label="Server base URL"><Input value={rc.baseUrl} onChange={(e) => setRemote({ baseUrl: e.target.value })} className="font-mono" placeholder="http://localhost:9900" /></Field>
        <Field label="API key"><Input type="password" value={rc.apiKey} onChange={(e) => setRemote({ apiKey: e.target.value })} className="font-mono" placeholder="nx_live_…" /></Field>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={test} disabled={testing}>{testing ? "pinging…" : "Test connection"}</Button>
        <Badge tone={rc.enabled ? "emerald" : "slate"}>{rc.enabled ? "remote enabled" : "local engine"}</Badge>
        {ping && <Badge tone={ping.ok ? "emerald" : "rose"}>{ping.ok ? `✓ ${ping.status}` : `✕ ${ping.error}`}</Badge>}
      </div>
    </div>
  );
}
