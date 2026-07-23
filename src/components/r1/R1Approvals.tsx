/**
 * E6-S3 Approval inbox and safe decision UX
 * AC:
 * 1. List shows risk, action, project, agent, expiry, and “no side effect yet.”
 * 2. Detail shows plain-language effect, exact redacted operation, policy reason, identity, evidence.
 * 3. Approve button names the side effect; deny equally accessible.
 * 4. Focus management, keyboard flow, escape, screen-reader labels correct.
 * 5. Stale/mismatched decision errors explain action must be refreshed.
 */
import { useEffect, useState, useRef } from 'react';
import { r1 } from '../../lib/r1-client';
import { Badge, Button, Card } from '../ui';

export function R1ApprovalInbox() {
  const projectId = localStorage.getItem('r1-project-id') ?? '';
  const [approvals, setApprovals] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  async function load() {
    if (!projectId) return;
    try {
      const list = await r1.listApprovals(projectId);
      setApprovals(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { load(); const id = setInterval(load, 3000); return () => clearInterval(id); }, []);

  useEffect(() => {
    if (selected && dialogRef.current) {
      dialogRef.current.showModal();
      // Focus management
      const heading = dialogRef.current.querySelector('h3') as HTMLElement;
      heading?.focus();
    }
  }, [selected]);

  async function decide(decision: 'approved' | 'denied') {
    if (!selected) return;
    try {
      await r1.decideApproval(projectId, selected.id, decision, selected.action.actionHash, selected.action.policyVersion);
      setSelected(null);
      dialogRef.current?.close();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!projectId) return <Card className="p-6"><p className="text-xs text-slate-500">No project selected. Initialize a project to see approvals.</p></Card>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-100">Approval inbox</h1>
      <p className="text-xs text-slate-400">Risky side effects pause before execution. No side effect yet until approved.</p>

      {approvals.length === 0 ? <Card className="p-8 text-center"><div className="text-2xl">✓</div><p className="mt-2 text-sm text-slate-400">No pending approvals</p></Card> : (
        <div className="space-y-3">
          {approvals.map((appr) => (
            <Card key={appr.id} className="p-4 border-amber-700/30" tabIndex={0} role="button" aria-label={`Approval ${appr.action.tool} risk ${appr.action.riskReason}`} onClick={() => setSelected(appr)} onKeyDown={(e) => { if (e.key === 'Enter') setSelected(appr); }}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone="amber">⚠ pending</Badge>
                    <Badge tone={appr.action.riskReason?.includes('high') ? 'rose' : 'amber'}>{appr.action.riskReason ?? 'high risk'}</Badge>
                    <span className="font-mono text-xs text-slate-300">{appr.action.tool}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">Proposed: {appr.action.tool} with {Object.keys(appr.action.args ?? {}).length} args</p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">Project: {appr.projectId} · Agent: {appr.action.agentId} · Expires: {new Date(appr.action.expiryAt).toLocaleString()} · No side effect yet</p>
                </div>
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelected(appr); }}>Review →</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <dialog ref={dialogRef} className="rounded-lg border border-nexus-border bg-slate-900 p-0 backdrop:bg-black/50" onClose={() => setSelected(null)} onKeyDown={(e) => { if (e.key === 'Escape') { setSelected(null); dialogRef.current?.close(); } }}>
        {selected && (
          <div className="max-w-2xl p-6">
            <h3 tabIndex={-1} className="text-sm font-semibold text-slate-100 focus:outline-none">Approve {selected.action.tool}?</h3>
            <div className="mt-4 space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-300">What will happen?</h4>
                <p className="mt-1 text-xs text-slate-400">The agent wants to <strong>{selected.action.tool}</strong> inside project scope. This action is classified as {selected.action.riskReason}.</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-300">Exact operation (redacted)</h4>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-slate-400">{JSON.stringify(selected.action.redactedArgs ?? selected.action.args, null, 2)}</pre>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-300">Why approval required?</h4>
                <p className="text-xs text-slate-400">Policy {selected.action.policyVersion} rule {selected.action.riskReason}. Tool is outside low-risk allowlist.</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-300">Who asked?</h4>
                <p className="text-xs text-slate-400">Principal {selected.action.actorId} · Agent {selected.action.agentId} · Task {selected.taskId} · Correlation {selected.id}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-300">Safety</h4>
                <p className="text-xs text-slate-500">Action hash: <span className="font-mono">{selected.action.actionHash.slice(0, 16)}…</span> · Policy version: {selected.action.policyVersion} · Expiry: {new Date(selected.action.expiryAt).toLocaleString()}</p>
                <p className="mt-1 text-[11px] text-amber-300">No side effect has occurred yet. Denying produces auditable result, not success.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={() => decide('approved')} aria-label={`Approve write to ${Object.keys(selected.action.args ?? {}).join(', ') || selected.action.tool}`}>✓ Approve {selected.action.tool}</Button>
                <Button variant="danger" size="sm" onClick={() => decide('denied')} aria-label="Deny action">✕ Deny</Button>
                <Button variant="ghost" size="sm" onClick={() => { setSelected(null); dialogRef.current?.close(); }}>Close</Button>
              </div>
              {error && <p role="alert" className="text-xs text-rose-400">Error: {error}. The action may have expired or changed hash — refresh and review again.</p>}
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
