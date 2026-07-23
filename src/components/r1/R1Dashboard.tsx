/**
 * E6-S1 R1 dashboard and project setup UX
 * Acceptance:
 * 1. Dashboard shows project mode, health, pending approvals, active/recoverable tasks, capability status
 * 2. Empty state guides project initialization
 * 3. Setup wizard explains local/shared mode and safe defaults
 * 4. Loading, empty, offline, degraded, error, permission states implemented
 * 5. Keyboard and screen-reader checks pass
 */
import { useEffect, useState } from 'react';
import { r1 } from '../../lib/r1-client';
import { Badge, Button, Card, SectionTitle, Input, Select } from '../ui';
import { useNavigate } from 'react-router-dom';

interface ProjectHealth {
  mode: 'local' | 'shared';
  storageHealthy: boolean;
  providerHealthy: boolean;
  embeddingHealthy: boolean;
  syncState: string;
}

export function R1Dashboard() {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<string>(() => localStorage.getItem('r1-project-id') ?? '');
  const [project, setProject] = useState<any>(null);
  const [status, setStatus] = useState<ProjectHealth | null>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [telemetry, setTelemetry] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizard, setWizard] = useState({ name: 'agentic-os-demo', mode: 'local' as 'local' | 'shared', idempotencyKey: `init-${Date.now()}` });

  const offline = !navigator.onLine;

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const proj = await r1.inspectProject(projectId);
        setProject(proj?.project ?? proj);
        setStatus(proj?.status ?? null);
        const [appr, tsk, tel] = await Promise.all([
          r1.listApprovals(projectId).catch(() => []),
          r1.listTasks(projectId).catch(() => []),
          r1.telemetry(projectId).catch(() => null),
        ]);
        setApprovals(appr);
        setTasks(tsk);
        setTelemetry(tel);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  async function initProject() {
    try {
      const id = crypto.randomUUID();
      const created = await r1.createProject({ id, name: wizard.name, mode: wizard.mode, idempotencyKey: wizard.idempotencyKey });
      localStorage.setItem('r1-project-id', created.id ?? id);
      setProjectId(created.id ?? id);
      setShowWizard(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-20 animate-pulse rounded-lg bg-slate-800/50" />
        <div className="h-40 animate-pulse rounded-lg bg-slate-800/50" />
      </div>
    );
  }

  if (!projectId || error?.includes('not found') || !project) {
    return (
      <div className="space-y-6">
        <SectionTitle title="R1 Governed Workbench" subtitle="Initialize a project to run your first durable, approval-gated task" />
        <Card className="p-8">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 text-4xl">🧠</div>
            <h3 className="text-lg font-semibold text-slate-100">No project selected</h3>
            <p className="mt-2 max-w-md text-sm text-slate-400">
              Initialize a project to get isolated memory, tasks, approvals, receipts and evidence. Local-only mode works offline with no backend.
            </p>
            <Button variant="primary" className="mt-6" onClick={() => setShowWizard(true)}>Initialize project</Button>
            {error && <p className="mt-4 text-xs text-rose-400" role="alert">Error: {error}</p>}
          </div>
        </Card>

        {showWizard && (
          <Card className="p-6" role="dialog" aria-modal="true" aria-label="Project setup wizard">
            <h4 className="text-sm font-semibold text-slate-200">Project setup wizard</h4>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-400">Project name</label>
                <Input value={wizard.name} onChange={(e) => setWizard({ ...wizard, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-slate-400">Mode</label>
                <Select value={wizard.mode} onChange={(e) => setWizard({ ...wizard, mode: e.target.value as any })}>
                  <option value="local">Local-only (offline, private, bounded tools)</option>
                  <option value="shared">Shared backend (optional sync, requires backend)</option>
                </Select>
                <p className="mt-1 text-[11px] text-slate-500">
                  {wizard.mode === 'local'
                    ? 'Data stays on this device. Provider failure degrades to lexical recall. Tools are sandboxed.'
                    : 'Sync one project to a shared backend with explicit push/pull and conflict visibility.'}
                </p>
              </div>
              <div className="rounded border border-slate-700 bg-slate-900/40 p-3 text-[11px] text-slate-400">
                <p><strong className="text-slate-300">Safe defaults:</strong> local-only, bounded file tools, approval for writes, append-only audit, redacted exports.</p>
                <p className="mt-1">External content (MCP/A2A/model output) is untrusted by default.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="primary" onClick={initProject}>Create project</Button>
                <Button variant="ghost" onClick={() => setShowWizard(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-4">
          <h4 className="text-xs uppercase tracking-wider text-slate-500">Initialization checklist</h4>
          <ol className="mt-2 list-decimal pl-5 text-xs text-slate-400">
            <li>Choose local-only or shared</li>
            <li>Review data and telemetry defaults (metadata-only, no raw content)</li>
            <li>Select initial capabilities (read-file auto, write-file requires approval)</li>
            <li>Confirm and note project ID</li>
          </ol>
        </Card>
      </div>
    );
  }

  if (offline) {
    return (
      <Card className="p-6" role="status" aria-live="polite">
        <Badge tone="amber">Offline</Badge>
        <p className="mt-2 text-sm text-slate-300">You are offline. Local mode remains usable; sync is pending.</p>
        <p className="mt-1 text-xs text-slate-500">Project: {projectId}</p>
      </Card>
    );
  }

  const pendingApprovals = approvals.filter((a: any) => a.state === 'pending');
  const activeTasks = tasks.filter((t: any) => ['queued', 'running', 'waiting_approval', 'retrying'].includes(t.state));
  const failedTasks = tasks.filter((t: any) => t.state === 'failed');
  const degraded = status && (!status.storageHealthy || !status.providerHealthy || !status.embeddingHealthy);

  return (
    <div className="space-y-6" role="main" aria-label="R1 Dashboard">
      <SectionTitle
        title="R1 Dashboard"
        subtitle={`Project ${project?.name ?? projectId} — ${status?.mode ?? 'unknown'} mode`}
        action={<Button size="sm" variant="ghost" onClick={() => { localStorage.removeItem('r1-project-id'); setProjectId(''); }}>Switch project</Button>}
      />

      {/* Project context card */}
      <Card className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              {project?.name ?? 'Unknown project'}
              <Badge tone={status?.mode === 'local' ? 'emerald' : 'cyan'}>{status?.mode ?? 'local'} {status?.mode === 'local' ? 'only' : ''}</Badge>
              {degraded && <Badge tone="amber">Degraded</Badge>}
            </h3>
            <p className="mt-1 font-mono text-[11px] text-slate-500">{projectId}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px]">
              <div>Storage: <span className={status?.storageHealthy ? 'text-emerald-400' : 'text-rose-400'}>{status?.storageHealthy ? 'healthy' : 'unhealthy'}</span></div>
              <div>Provider: <span className={status?.providerHealthy ? 'text-emerald-400' : 'text-amber-400'}>{status?.providerHealthy ? 'healthy' : 'degraded'}</span></div>
              <div>Embedding: <span className={status?.embeddingHealthy ? 'text-emerald-400' : 'text-amber-400'}>{status?.embeddingHealthy ? 'healthy' : 'lexical fallback'}</span></div>
              <div>Sync: {status?.syncState ?? 'disabled'}</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="primary" size="sm" onClick={() => navigate('/r1/tasks/start')}>Start task</Button>
            <Button variant="outline" size="sm" onClick={async () => { const exp = await r1.evidenceExport(projectId); const blob = new Blob([JSON.stringify(exp, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `evidence-${projectId}.json`; a.click(); }}>Export</Button>
          </div>
        </div>
      </Card>

      {/* Needs attention */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <h4 className="text-xs font-semibold text-slate-300">Pending approvals</h4>
          <p className="mt-2 text-2xl font-mono text-amber-400">{pendingApprovals.length}</p>
          <p className="text-[11px] text-slate-500">Require human decision before side effects</p>
          {pendingApprovals.length > 0 && <Button size="sm" variant="ghost" className="mt-2" onClick={() => navigate('/r1/approvals')}>Open inbox →</Button>}
        </Card>
        <Card className="p-4">
          <h4 className="text-xs font-semibold text-slate-300">Failed / recoverable</h4>
          <p className="mt-2 text-2xl font-mono text-rose-400">{failedTasks.length}</p>
          <p className="text-[11px] text-slate-500">Check retry or compensation</p>
        </Card>
        <Card className="p-4">
          <h4 className="text-xs font-semibold text-slate-300">Active work</h4>
          <p className="mt-2 text-2xl font-mono text-cyan-400">{activeTasks.length}</p>
          <p className="text-[11px] text-slate-500">Queued / running tasks</p>
        </Card>
      </div>

      {/* Active work panel */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold text-slate-200">Active work</h4>
        {activeTasks.length === 0 ? <p className="mt-2 text-xs text-slate-500">No active tasks. Start a governed task to see timeline.</p> : (
          <div className="mt-3 space-y-2">
            {activeTasks.slice(0, 5).map((t: any) => (
              <div key={t.id} className="flex items-center gap-3 rounded border border-nexus-border bg-slate-950/40 px-3 py-2">
                <Badge tone="cyan">{t.state}</Badge>
                <span className="truncate text-xs text-slate-200">{t.title ?? t.goal ?? t.id}</span>
                <span className="ml-auto font-mono text-[10px] text-slate-500">{new Date(t.updatedAt).toLocaleTimeString()}</span>
                <Button size="sm" variant="ghost" onClick={() => navigate(`/r1/tasks/${t.id}`)}>Open →</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Capability health */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold text-slate-200">Capability health</h4>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-[11px] text-slate-400">
          <div>Provider: {status?.providerHealthy ? '✓' : '⚠ degraded (lexical fallback)'}</div>
          <div>Embeddings: {status?.embeddingHealthy ? '✓ healthy' : '○ lexical fallback'}</div>
          <div>Storage: {status?.storageHealthy ? '✓ reachable' : '✕ unreachable'}</div>
          <div>Tool gateway: {telemetry ? '✓' : '○ unknown'}</div>
        </div>
      </Card>

      {error && <Card className="p-4 border-rose-500/30"><p role="alert" className="text-xs text-rose-400">Error: {error}</p></Card>}
    </div>
  );
}
