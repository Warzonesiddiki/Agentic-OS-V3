import { useState, useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PageId } from '../components/Shell';
import { nexus, useNexus, useConfig, LOCAL_KEY } from '../store';
import { Badge, Card, CodeBlock, SectionTitle, Stat } from '../components/ui';
import { formatCompact, formatNumber, shortHash, timeAgo } from '../lib/core';
import { llmMode } from '../lib/config';
import { getRemote, remote as remoteApi, subscribeRemote } from '../lib/remote';

export default function Dashboard() {
  const navigate = useNavigate();
  const s = useNexus();
  const cfg = useConfig();
  const tokensSaved = s.ledger.reduce((a, e) => a + e.tokensSaved, 0);
  const audit = nexus.verifyAudit();
  const amb = nexus.ambient();
  const recent = [...s.audit].slice(-7).reverse();
  const drift = Date.now() - Number(s.meta.lastHeartbeat ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
          NEXUS 2.0 — Operating System for AI Agents
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Persistent memory, token-budgeted recall, skills, governance and an MCP surface — a second
          brain your agents actually use.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Memories" value={formatNumber(s.memories.length)} tone="violet" />
        <Stat label="Skills" value={formatNumber(s.skills.length)} tone="cyan" />
        <Stat label="Notes" value={formatNumber(s.notes.length)} tone="emerald" />
        <Stat label="Projects" value={formatNumber(s.projects.length)} tone="amber" />
        <Stat
          label="Tokens saved"
          value={formatCompact(tokensSaved)}
          sub="reused knowledge"
          tone="emerald"
        />
        <Stat
          label="Audit entries"
          value={formatNumber(s.audit.length)}
          sub={audit.valid ? 'chain valid' : 'BROKEN'}
          tone={audit.valid ? 'emerald' : 'rose'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle
            title="System health"
            subtitle="Live snapshot of the brain and its subsystems"
          />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Health label="Store" value="reachable" ok />
            <Health
              label="Audit chain"
              value={
                audit.valid ? `valid · ${audit.verifiedEntries}` : `broken @ ${audit.brokenAt}`
              }
              ok={audit.valid}
            />
            <Health
              label="LLM mode"
              value={llmMode()}
              ok={llmMode() === 'configured'}
              warn={llmMode() !== 'configured'}
            />
            <Health label="Recall engine" value="BM25 lexical" ok />
            <Health
              label="Kill switch"
              value={s.meta.killSwitch === '1' ? 'ENGAGED' : 'disengaged'}
              ok={s.meta.killSwitch !== '1'}
            />
            <Health
              label="Heartbeat"
              value={drift < 60000 ? 'fresh' : 'stale'}
              ok={drift < 60000}
              warn={drift >= 60000}
            />
          </div>
          <div className="mt-5">
            <div className="mb-2 text-xs font-medium text-slate-400">
              Ambient context <span className="text-slate-600">({amb.tokens} tokens)</span>
            </div>
            <CodeBlock>{amb.text}</CodeBlock>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle
            title="Recent activity"
            subtitle="Hash-chained audit tail"
            action={
              <button
                onClick={() => navigate('/audit')}
                className="text-xs text-cyan-400 hover:underline"
              >
                view all →
              </button>
            }
          />
          <div className="mt-3 space-y-2">
            {recent.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-lg border border-nexus-border bg-slate-950/40 px-3 py-2"
              >
                <span className="font-mono text-[10px] text-slate-600">#{e.sequence}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs text-slate-300">{e.action}</div>
                  <div className="text-[10px] text-slate-600">
                    {e.actor} · {timeAgo(e.createdAt)}
                  </div>
                </div>
                <span className="font-mono text-[9px] text-slate-700">
                  {shortHash(e.entryHash, 7)}
                </span>
              </div>
            ))}
            {!recent.length && <div className="text-xs text-slate-600">No activity yet.</div>}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle
          title="Connect an agent (MCP)"
          subtitle="Point any MCP client at the local endpoint"
          action={
            <button
              onClick={() => navigate('/docs')}
              className="text-xs text-cyan-400 hover:underline"
            >
              full docs →
            </button>
          }
        />
        <p className="mt-2 text-xs text-slate-500">
          Every tool validates input with Zod, maps to a scope, respects the kill switch, and never
          bypasses REST security.
        </p>
        <div className="mt-3">
          <CodeBlock>{`# Endpoint
POST ${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:9900'}/api/mcp

# Local operator key (auto-authenticated in this UI)
Authorization: Bearer ${LOCAL_KEY}

# Tools: nexus_recall · nexus_ask · nexus_remember · nexus_capture
#         nexus_checkpoint · nexus_skill · nexus_transfer · nexus_feedback
#         nexus_vault · nexus_maintain`}</CodeBlock>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <Badge tone="cyan">9 scopes</Badge>
          <Badge tone="emerald">constant-time auth</Badge>
          <Badge tone="amber">payload-limited</Badge>
          <Badge tone="slate">rate-limited {cfg.rateLimitPerMinute}/min</Badge>
        </div>
      </Card>

      <ServerStatus />
    </div>
  );
}

function Health({
  label,
  value,
  ok,
  warn,
}: {
  label: string;
  value: string;
  ok?: boolean;
  warn?: boolean;
}) {
  const dot = ok ? 'bg-emerald-400' : warn ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <div className="rounded-lg border border-nexus-border bg-slate-950/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot} ${ok ? '' : 'nexus-pulse'}`} />
        <span className="font-mono text-xs text-slate-200">{value}</span>
      </div>
    </div>
  );
}

function ServerStatus() {
  const [status, setStatus] = useState<{ ok: boolean; status?: string; error?: string } | null>(
    null
  );
  // useSyncExternalStore so the panel re-renders when the remote config changes.
  const remote = useSyncExternalStore(subscribeRemote, getRemote, getRemote);

  useEffect(() => {
    if (!remote.enabled) {
      setStatus(null);
      return;
    }
    remoteApi
      .ping()
      .then(setStatus)
      .catch(() => setStatus({ ok: false, error: 'ping failed' }));
  }, [remote.enabled, remote.baseUrl, remote.apiKey]);

  if (!remote.enabled) return null;

  return (
    <Card className="p-4">
      <SectionTitle title="Server connection" subtitle="Remote NEXUS backend (Settings → Remote)" />
      <div className="mt-2 flex items-center gap-3">
        {status === null ? (
          <Badge tone="slate">checking…</Badge>
        ) : status.ok ? (
          <Badge tone="emerald">✓ connected — {status.status}</Badge>
        ) : (
          <Badge tone="rose">✕ {status.error}</Badge>
        )}
        <span className="font-mono text-[10px] text-slate-600">{remote.baseUrl}</span>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        When connected, the dashboard can read/write through the server's REST API. Currently: local
        engine only. Remote data path is planned for full integration.
      </p>
    </Card>
  );
}
