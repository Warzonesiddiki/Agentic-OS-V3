import { useState } from "react";
import { nexus, useNexus } from "../store";
import { Badge, Button, Card, EmptyState, Field, Input, SectionTitle, Select, Tag, Textarea } from "../components/ui";
import { formatBytes } from "../lib/core";
import { parseMarkdown } from "../lib/vault";
import { toast } from "../lib/toast";

export default function Vault() {
  const s = useNexus();
  const [path, setPath] = useState("/vault/notes/idea.md");
  const [content, setContent] = useState("---\ntitle: Idea\ntags: [research]\n---\n# Idea\nLinks to [[recall-strategy]] and #research notes.");
  const [selected, setSelected] = useState<string | null>(null);

  const safe = nexus.safeVaultPath(path);
  const parsed = content ? parseMarkdown(path, content) : null;
  const note = s.notes.find((n) => n.path === selected);

  function writeBack(memId: string) {
    try {
      const r = nexus.writeBack(memId);
      toast.success(`Wrote memory to ${r.path}`);
    } catch (e) {
      toast.danger((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle title="Obsidian vault bridge" subtitle="Index markdown, parse frontmatter/tags/wikilinks, write back — path-safe" />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card className="space-y-3 p-4">
            <SectionTitle title="Add markdown file" subtitle="Paths are confined to /vault" />
            <Field label="Path"><Input value={path} onChange={(e) => setPath(e.target.value)} className="font-mono" /></Field>
            <div className={`rounded-lg border p-2 text-[11px] ${safe.ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : "border-rose-500/30 bg-rose-500/5 text-rose-300"}`}>
              {safe.ok ? `✓ resolves to ${safe.resolved}` : `✕ ${safe.reason} (${safe.resolved || path})`}
            </div>
            <Field label="Markdown content"><Textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} /></Field>
            <Button variant="primary" onClick={() => { try { nexus.addVaultFile(path, content); toast.success(`Added ${path} to vault`); } catch (e) { toast.danger((e as Error).message); } }} disabled={!safe.ok}>Add to vault</Button>

            {parsed && (
              <div className="rounded-lg border border-nexus-border bg-slate-950/40 p-2 text-[11px]">
                <div className="text-slate-500">Parsed preview</div>
                <div className="mt-1 text-slate-300">title: <span className="font-mono text-cyan-300">{parsed.title}</span></div>
                <div className="mt-1 flex flex-wrap gap-1">{parsed.tags.map((t) => <Tag key={t}>{t}</Tag>)}{parsed.wikilinks.map((w) => <span key={w} className="rounded border border-violet-500/30 bg-violet-500/10 px-1 font-mono text-[10px] text-violet-300">[[{w}]]</span>)}</div>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle title="Write-back" subtitle="Export a memory into the vault" action={<Button size="sm" variant="outline" onClick={() => nexus.indexVault()}>Sync vault →</Button>} />
            <p className="mt-2 text-[11px] text-slate-500">Select a memory to write it back as a frontmatter markdown note. Target path is validated against traversal.</p>
            <Select className="mt-2" defaultValue="" onChange={(e) => e.target.value && writeBack(e.target.value)}>
              <option value="">Choose a memory to export…</option>
              {s.memories.slice(0, 30).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </Select>
          </Card>
        </div>

        <Card className="p-4">
          <SectionTitle title="Vault files" subtitle={`${s.vaultFiles.length} files · ${s.notes.length} indexed`} />
          {s.vaultFiles.length === 0 ? (
            <EmptyState title="Vault is empty" />
          ) : (
            <div className="mt-3 space-y-2">
              {s.vaultFiles.map((f) => (
                <button key={f.path} onClick={() => setSelected(f.path)} className="block w-full rounded-lg border border-nexus-border bg-slate-950/40 px-3 py-2 text-left hover:border-cyan-500/40">
                  <div className="flex items-center gap-2">
                    <code className="truncate font-mono text-xs text-slate-200">{f.path}</code>
                    <span className="ml-auto font-mono text-[10px] text-slate-600">{formatBytes(f.content.length)}</span>
                  </div>
                  <div className="mt-1 line-clamp-1 font-mono text-[10px] text-slate-600">{f.content.replace(/---[\s\S]*?---/, "").slice(0, 80)}</div>
                </button>
              ))}
            </div>
          )}

          {note && (
            <div className="mt-4 rounded-lg border border-nexus-border bg-slate-950/60 p-3">
              <div className="flex items-center gap-2">
                <Badge tone="emerald">note</Badge>
                <span className="text-sm font-medium text-slate-100">{note.title}</span>
              </div>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-slate-300">{note.content}</pre>
              <div className="mt-2 flex flex-wrap gap-1">{note.tags.map((t) => <Tag key={t}>{t}</Tag>)}{note.wikilinks.map((w) => <span key={w} className="rounded border border-violet-500/30 bg-violet-500/10 px-1 font-mono text-[10px] text-violet-300">[[{w}]]</span>)}</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
