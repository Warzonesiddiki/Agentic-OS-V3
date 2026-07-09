import { Badge, Card, CodeBlock, SectionTitle } from "../components/ui";
import Console from "../components/Console";
import { LOCAL_KEY } from "../store";
import { MCP_PROMPTS, MCP_RESOURCES, MCP_TOOLS } from "../lib/mcp";

const ORIGIN = typeof window !== "undefined" ? window.location.origin : "http://localhost:9900";

const ENDPOINTS: { m: string; p: string; scope?: string; pub?: boolean }[] = [
  // Public
  { m: "GET", p: "/api/v1/health", pub: true },
  { m: "GET", p: "/api/v1/metrics", pub: true },
  { m: "GET", p: "/api/v1/system", pub: true },
  { m: "GET", p: "/api/v1/health/detailed", scope: "memory:read" },
  // Memories CRUD
  { m: "GET", p: "/api/v1/memories", scope: "memory:read" },
  { m: "POST", p: "/api/v1/memories", scope: "memory:write" },
  { m: "GET", p: "/api/v1/memories/:id", scope: "memory:read" },
  { m: "PATCH", p: "/api/v1/memories/:id", scope: "memory:write" },
  { m: "DELETE", p: "/api/v1/memories/:id", scope: "memory:write" },
  // Recall
  { m: "GET", p: "/api/v1/recall?q=&budget=", scope: "memory:read" },
  { m: "POST", p: "/api/v1/recall/conversation", scope: "memory:read" },
  // Skills CRUD
  { m: "GET", p: "/api/v1/skills", scope: "skill:read" },
  { m: "POST", p: "/api/v1/skills", scope: "skill:write" },
  { m: "GET", p: "/api/v1/skills/:id", scope: "skill:read" },
  { m: "PATCH", p: "/api/v1/skills/:id", scope: "skill:write" },
  { m: "DELETE", p: "/api/v1/skills/:id", scope: "skill:write" },
  { m: "POST", p: "/api/v1/skills/:id/outcome", scope: "skill:write" },
  // Sessions / Capture
  { m: "POST", p: "/api/v1/sessions/capture", scope: "memory:write" },
  { m: "POST", p: "/api/v1/checkpoint", scope: "memory:write" },
  // Projects
  { m: "GET", p: "/api/v1/projects", scope: "memory:read" },
  { m: "POST", p: "/api/v1/projects/transfer", scope: "memory:write" },
  // Feedback
  { m: "POST", p: "/api/v1/feedback", scope: "memory:write" },
  // Brain
  { m: "GET", p: "/api/v1/brain/export", scope: "brain:admin" },
  { m: "POST", p: "/api/v1/brain/import", scope: "brain:admin" },
  { m: "POST", p: "/api/v1/brain/compress", scope: "brain:admin" },
  { m: "POST", p: "/api/v1/brain/embeddings/rebuild", scope: "brain:admin" },
  // Vault
  { m: "GET", p: "/api/v1/vault/notes", scope: "vault:read" },
  { m: "POST", p: "/api/v1/vault/sync", scope: "vault:write" },
  { m: "POST", p: "/api/v1/vault/write-back", scope: "vault:write" },
  // Audit
  { m: "GET", p: "/api/v1/audit", scope: "audit:read" },
  { m: "GET", p: "/api/v1/ledger", scope: "audit:read" },
  { m: "GET", p: "/api/v1/audit/verify", scope: "audit:read" },
  { m: "POST", p: "/api/v1/audit/trajectory", scope: "audit:read" },
  { m: "POST", p: "/api/v1/audit/receipt", scope: "audit:read" },
  // Safety
  { m: "GET", p: "/api/v1/safety" },
  { m: "POST", p: "/api/v1/safety/heartbeat", scope: "safety:write" },
  { m: "POST", p: "/api/v1/safety/kill-switch", scope: "safety:write" },
  // Admin / API keys
  { m: "GET", p: "/api/v1/admin/keys", scope: "brain:admin" },
  { m: "POST", p: "/api/v1/admin/keys", scope: "brain:admin" },
  { m: "DELETE", p: "/api/v1/admin/keys/:id", scope: "brain:admin" },
  // SSE Events
  { m: "POST", p: "/api/v1/events/token" },
  { m: "GET", p: "/api/v1/events?token=" },
  { m: "GET", p: "/api/v1/events/count" },
  // Analytics
  { m: "GET", p: "/api/v1/analytics", scope: "audit:read" },
  // Multi-Agent Kernel
  { m: "GET", p: "/api/v1/agents", scope: "memory:read" },
  { m: "POST", p: "/api/v1/agents", scope: "brain:admin" },
  { m: "GET", p: "/api/v1/agents/:id", scope: "memory:read" },
  { m: "PATCH", p: "/api/v1/agents/:id/state", scope: "brain:admin" },
  { m: "POST", p: "/api/v1/agents/:id/quarantine", scope: "brain:admin" },
  // Task Queue
  { m: "POST", p: "/api/v1/tasks", scope: "memory:write" },
  { m: "POST", p: "/api/v1/tasks/:id/complete", scope: "memory:write" },
  { m: "POST", p: "/api/v1/tasks/:id/fail", scope: "memory:write" },
  // Worker
  { m: "GET", p: "/api/v1/worker/status", scope: "memory:read" },
  { m: "POST", p: "/api/v1/worker/start", scope: "brain:admin" },
  { m: "POST", p: "/api/v1/worker/stop", scope: "brain:admin" },
  { m: "POST", p: "/api/v1/worker/configure", scope: "brain:admin" },
  // Scheduler
  { m: "GET", p: "/api/v1/scheduler/status", scope: "memory:read" },
  { m: "POST", p: "/api/v1/scheduler/tick", scope: "brain:admin" },
  // Cron
  { m: "GET", p: "/api/v1/cron", scope: "memory:read" },
  { m: "POST", p: "/api/v1/cron", scope: "brain:admin" },
  { m: "POST", p: "/api/v1/cron/:id/toggle", scope: "brain:admin" },
  { m: "POST", p: "/api/v1/cron/tick", scope: "brain:admin" },
  // Bus
  { m: "GET", p: "/api/v1/bus/status", scope: "memory:read" },
  // Ambient Ingestion
  { m: "POST", p: "/api/v1/ambient/ingest", scope: "memory:write" },
  // Browser Automation
  { m: "POST", p: "/api/v1/browser/navigate", scope: "memory:write" },
  { m: "POST", p: "/api/v1/browser/click", scope: "memory:write" },
  { m: "POST", p: "/api/v1/browser/extract", scope: "memory:read" },
  { m: "POST", p: "/api/v1/browser/screenshot", scope: "memory:read" },
  // HITL Approval Gates
  { m: "POST", p: "/api/v1/approvals/request", scope: "memory:write" },
  { m: "POST", p: "/api/v1/approvals/resolve", scope: "brain:admin" },
  // Workspace Code Injection
  { m: "POST", p: "/api/v1/workspace/sync", scope: "brain:admin" },
  // Skill Compilation
  { m: "GET", p: "/api/v1/compiled-scripts", scope: "memory:read" },
  { m: "POST", p: "/api/v1/compiled-scripts/compile", scope: "brain:admin" },
  // MCP
  { m: "POST", p: "/api/mcp" },
];

const TONE: Record<string, "emerald" | "amber" | "rose" | "cyan" | "violet"> = {
  GET: "emerald",
  POST: "amber",
  PATCH: "violet",
  DELETE: "rose",
};

export default function Docs() {
  return (
    <div className="space-y-5">
      <SectionTitle title="API & MCP reference" subtitle="Versioned REST under /api/v1 plus the MCP JSON-RPC surface" />

      <Card className="p-4">
        <SectionTitle title="REST endpoints" subtitle="Every mutation requires auth + scope; all input is Zod-validated" />
        <div className="mt-3 overflow-hidden rounded-lg border border-nexus-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Method</th>
                <th scope="col" className="px-3 py-2 font-medium">Path</th>
                <th scope="col" className="px-3 py-2 font-medium">Scope / Auth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nexus-border">
              {ENDPOINTS.map((e, i) => (
                <tr key={i} className="hover:bg-slate-900/40">
                  <td className="px-3 py-1.5">
                    <span className="font-mono">{e.m.split("|").map((m) => <Badge key={m} tone={TONE[m] ?? "slate"}>{m}</Badge>)}</span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-slate-300">{e.p}</td>
                  <td className="px-3 py-1.5">{e.pub ? <Badge tone="emerald">public</Badge> : e.scope ? <span className="font-mono text-[10px] text-slate-400">{e.scope}</span> : <Badge tone="slate">auth</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle title="MCP tools" subtitle="Zod-validated, scope-mapped" />
          <div className="mt-3 space-y-1.5">
            {MCP_TOOLS.map((t) => (
              <div key={t.name} className="rounded-lg border border-nexus-border bg-slate-950/40 px-3 py-2">
                <code className="font-mono text-xs text-cyan-300">{t.name}</code>
                <p className="mt-0.5 text-[11px] text-slate-400">{t.description}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-4">
            <SectionTitle title="Resources" />
            <div className="mt-3 space-y-1">
              {MCP_RESOURCES.map((r) => (
                <div key={r.uri} className="font-mono text-[11px] text-slate-300">{r.uri} <span className="text-slate-600">— {r.description}</span></div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <SectionTitle title="Prompts" />
            <div className="mt-3 space-y-1">
              {MCP_PROMPTS.map((p) => (
                <div key={p.name} className="font-mono text-[11px] text-slate-300">{p.name} <span className="text-slate-600">— {p.description}</span></div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-4">
        <SectionTitle title="Example calls" subtitle={`Base: ${ORIGIN}`} />
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <CodeBlock>{`# Recall (REST)
curl -G ${ORIGIN}/api/v1/recall \\
  --data-urlencode "q=how to rank search" \\
  --data-urlencode "budget=1000" \\
  -H "Authorization: Bearer ${LOCAL_KEY.slice(0, 10)}…"`}</CodeBlock>
          <CodeBlock>{`# MCP tools/call
POST ${ORIGIN}/api/mcp
Authorization: Bearer ${LOCAL_KEY.slice(0, 10)}…

{
  "jsonrpc": "2.0", "id": 1,
  "method": "tools/call",
  "params": {
    "name": "nexus_remember",
    "arguments": {
      "title": "Ship behind a flag",
      "content": "Gate risky rollouts..."
    }
  }
}`}</CodeBlock>
        </div>
      </Card>

      <Console />
    </div>
  );
}
