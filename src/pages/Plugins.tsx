import { useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, SectionTitle, Textarea } from "../components/ui";
import { SkeletonLoader } from "../components/SkeletonLoader";
import { RefetchIndicator } from "../components/RefetchIndicator";
import { toast } from "../lib/toast";
import { v3 } from "../lib/remote";
import { useV3Query } from "../lib/hooks";

interface Plugin { id: string; name: string; version: string; description: string; trustState: string; installCount: number; manifest: Record<string, unknown> }
interface Receipt { id: string; pluginId: string; capability: string; exitCode: number; fuelUsed: number; durationMs: number; authorized: boolean; createdAt: string }

export default function Plugins() {
  const { data: pluginsResp, loading: loadingPlugins, isRefetching: refetchingPlugins, refetch: refetchPlugins } = useV3Query<{ items: Plugin[] }>("/api/v1/v3/plugins", []);
  const { data: receiptsResp, loading: loadingReceipts, isRefetching: refetchingReceipts, refetch: refetchReceipts } = useV3Query<{ items: Receipt[] }>("/api/v1/v3/plugin-receipts?limit=20", []);
  const plugins = pluginsResp?.items ?? [];
  const receipts = receiptsResp?.items ?? [];

  const [showRegister, setShowRegister] = useState(false);
  const [regForm, setRegForm] = useState({ name: "", version: "1.0.0", description: "", authorPubkey: "", signature: "", wasmBase64: "", manifestJson: "{}" });

  function reload() { refetchPlugins(); refetchReceipts(); }

  async function register() {
    let manifest: Record<string, unknown>;
    try { manifest = JSON.parse(regForm.manifestJson); } catch { toast.danger("Invalid JSON in manifest"); return; }
    const d = await v3.call("/api/v1/v3/plugins", {
      method: "POST",
      body: JSON.stringify({ ...regForm, manifest }),
    });
    if (d.ok) { toast.success("Plugin registered: " + regForm.name); setShowRegister(false); reload(); }
    else toast.danger(d.error?.message || "Registration failed");
  }

  async function uninstall(id: string) {
    const d = await v3.call(`/api/v1/v3/plugins/${id}/uninstall`, { method: "POST" });
    if (d.ok) { toast.success("Plugin uninstalled"); reload(); }
    else toast.danger(d.error?.message || "Uninstall failed");
  }

  async function revoke(id: string) {
    const reason = prompt("Revoke reason:");
    if (!reason) return;
    const d = await v3.call(`/api/v1/v3/plugins/${id}/revoke`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    if (d.ok) { toast.warning("Plugin revoked"); reload(); }
    else toast.danger(d.error?.message || "Revoke failed");
  }

  async function invoke(id: string) {
    const d = await v3.call(`/api/v1/v3/plugins/${id}/invoke`, {
      method: "POST",
      body: JSON.stringify({ agentId: "ui-user", capability: "llm.invoke", inputBase64: "" }),
    });
    if (d.ok) { toast.success("Plugin invoked"); reload(); }
    else toast.danger(d.error?.message || "Invoke failed");
  }

  return (
    <div className="space-y-6">
      <RefetchIndicator active={refetchingPlugins || refetchingReceipts} />
      <SectionTitle title="Plugin System" subtitle="WASM plugin registry with capability manifests and tamper-evident receipts" action={<Button variant="primary" onClick={() => setShowRegister(true)}>+ Register Plugin</Button>} />

      {loadingPlugins ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonLoader key={i} variant="card" />)}
        </div>
      ) : plugins.length === 0 ? (
        <EmptyState title="No plugins installed" hint="Register a signed WASM plugin to extend NEXUS." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {plugins.map(p => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={p.trustState === "trusted" ? "emerald" : p.trustState === "revoked" ? "rose" : "amber"}>{p.trustState}</Badge>
                    <h3 className="text-sm font-semibold text-slate-100">{p.name}</h3>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{p.description || "No description"}</div>
                  <div className="mt-1 font-mono text-[10px] text-slate-600">v{p.version} · {p.installCount} installs</div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => invoke(p.id)}>invoke</Button>
                  <Button size="sm" variant="ghost" onClick={() => uninstall(p.id)}>uninstall</Button>
                  <Button size="sm" variant="ghost" className="text-rose-400 hover:bg-rose-500/10" onClick={() => revoke(p.id)}>revoke</Button>
                </div>
              </div>
              {Array.isArray(p.manifest?.capabilities) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(p.manifest.capabilities as Array<{ exact?: string; prefix?: string }>).map((cap, i) => (
                    <Badge key={i} tone="cyan">{String(cap.exact || cap.prefix || "?")}</Badge>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Card className="p-5">
        <SectionTitle title="Recent Receipts" subtitle="Tamper-evident invocation logs" />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="pb-2">Plugin</th><th className="pb-2">Capability</th><th className="pb-2">Exit</th><th className="pb-2">Fuel</th><th className="pb-2">Duration</th><th className="pb-2">Auth</th>
            </tr></thead>
            <tbody>
              {loadingReceipts ? (
                Array.from({ length: 3 }).map((_, i) => <SkeletonLoader key={i} variant="table-row" />)
              ) : receipts.map(r => (
                <tr key={r.id} className="border-t border-nexus-border">
                  <td className="py-2 font-mono text-slate-300">{r.pluginId.slice(0, 12)}…</td>
                  <td className="py-2 text-slate-400">{r.capability}</td>
                  <td className="py-2"><Badge tone={r.exitCode === 0 ? "emerald" : "rose"}>{r.exitCode}</Badge></td>
                  <td className="py-2 font-mono text-slate-500">{r.fuelUsed}</td>
                  <td className="py-2 font-mono text-slate-500">{r.durationMs}ms</td>
                  <td className="py-2"><Badge tone={r.authorized ? "emerald" : "rose"}>{r.authorized ? "yes" : "no"}</Badge></td>
                </tr>
              ))}
              {!loadingReceipts && receipts.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate-600">No receipts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={showRegister} onClose={() => setShowRegister(false)} title="Register Plugin" wide>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><Input value={regForm.name} onChange={e => setRegForm({ ...regForm, name: e.target.value })} placeholder="io.nexus.myplugin" /></Field>
            <Field label="Version"><Input value={regForm.version} onChange={e => setRegForm({ ...regForm, version: e.target.value })} /></Field>
          </div>
          <Field label="Description"><Input value={regForm.description} onChange={e => setRegForm({ ...regForm, description: e.target.value })} /></Field>
          <Field label="Author Public Key (base64)"><Input value={regForm.authorPubkey} onChange={e => setRegForm({ ...regForm, authorPubkey: e.target.value })} className="font-mono" /></Field>
          <Field label="Signature (base64)"><Input value={regForm.signature} onChange={e => setRegForm({ ...regForm, signature: e.target.value })} className="font-mono" /></Field>
          <Field label="WASM Binary (base64)"><Textarea rows={3} value={regForm.wasmBase64} onChange={e => setRegForm({ ...regForm, wasmBase64: e.target.value })} className="font-mono text-[10px]" /></Field>
          <Field label="Manifest (JSON)"><Textarea rows={4} value={regForm.manifestJson} onChange={e => setRegForm({ ...regForm, manifestJson: e.target.value })} className="font-mono text-[10px]" /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setShowRegister(false)}>Cancel</Button>
            <Button variant="primary" onClick={register} disabled={!regForm.name}>Register</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
