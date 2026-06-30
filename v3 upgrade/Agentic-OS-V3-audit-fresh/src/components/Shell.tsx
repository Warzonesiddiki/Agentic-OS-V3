import type { ReactNode } from "react";
import { motion } from "motion/react";
import { nexus, useNexus } from "../store";
import { Badge, cn } from "./ui";

export type PageId =
  | "dashboard"
  | "memories"
  | "recall"
  | "skills"
  | "sessions"
  | "projects"
  | "vault"
  | "audit"
  | "safety"
  | "kernel"
  | "graph"
  | "cli"
  | "dream"
  | "evals"
  | "liveagents"
  | "analytics"
  | "approvals"
  | "docs"
  | "settings";

interface NavItem {
  id: PageId;
  label: string;
  icon: ReactNode;
  section: string;
}

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d={d} />
  </svg>
);

export const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", section: "Brain", icon: I("M4 13h16M4 7h16M4 19h10M4 3h16") },
  { id: "memories", label: "Memories", section: "Brain", icon: I("M12 6c-2.5 0-4.5 1.6-4.5 3.6 0 1.3.9 2.3 2.2 2.9M12 6c2.5 0 4.5 1.6 4.5 3.6 0 1.3-.9 2.3-2.2 2.9M12 6V4m0 11v-2m-2.3 3.6a2.4 2.4 0 0 0 4.6 0") },
  { id: "skills", label: "Skills", section: "Brain", icon: I("M14.7 6.3a3.5 3.5 0 0 0-5 5L4 17v3h3l5.7-5.7a3.5 3.5 0 0 0 5-5l-2.3 2.3-2-2 2.3-2.3Z") },
  { id: "recall", label: "Recall", section: "Cognition", icon: I("M11 19a8 8 0 1 1 5.3-2M11 19l-3 1 1-3M21 21l-4.3-4.3") },
  { id: "sessions", label: "Sessions", section: "Cognition", icon: I("M4 5h16v11H7l-3 3V5ZM8 9h8M8 12h5") },
  { id: "projects", label: "Projects", section: "Cognition", icon: I("M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z") },
  { id: "vault", label: "Vault", section: "Cognition", icon: I("M3 7l9-4 9 4-9 4-9-4Zm0 0v6l9 4 9-4V7M12 11v6") },
  { id: "audit", label: "Audit", section: "Operations", icon: I("M9 12l2 2 4-4M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4Z") },
  { id: "safety", label: "Safety", section: "Operations", icon: I("M12 2l8 4v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-4ZM12 8v4M12 16h.01") },
  { id: "kernel", label: "Kernel", section: "Agent OS", icon: I("M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6zM10 7h4M10 17h4M7 10v4M17 10v4") },
  { id: "graph", label: "Memory Graph", section: "Agent OS", icon: I("M5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm14 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6.5 6.5l4 4M17.5 6.5l-4 4M12 17v-4") },
  { id: "cli", label: "CLI & Hooks", section: "Agent OS", icon: I("M4 5h16v11H7l-3 3V5ZM8 9l2 2-2 2M12 13h4") },
  { id: "dream", label: "Dream & Doctor", section: "Agent OS", icon: I("M12 3a6 6 0 0 0 4 10.5V17H8v-3.5A6 6 0 0 0 12 3ZM9 20h6M10 6c1 1 3 1 4 0") },
  { id: "evals", label: "Evals & Safety", section: "Agent OS", icon: I("M9 12l2 2 4-4M4 6h16v12H4z") },
  { id: "liveagents", label: "Live Agents", section: "Agent OS", icon: I("M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 21v-1a6 6 0 0 1 12 0v1M19 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 0v2M5 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 0v2") },
  { id: "analytics", label: "Analytics", section: "Agent OS", icon: I("M3 3v18h18M7 14l3-4 3 2 4-6") },
  { id: "approvals", label: "Approvals", section: "Agent OS", icon: I("M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11") },
  { id: "docs", label: "API & MCP", section: "Developer", icon: I("M8 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-1M10 8l2 4-2 4M14 8v8") },
  { id: "settings", label: "Settings", section: "Developer", icon: I("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1Z") },
];

const SECTIONS = ["Brain", "Cognition", "Operations", "Agent OS", "Developer"];

export function Shell({ page, setPage, children }: { page: PageId; setPage: (p: PageId) => void; children: ReactNode }) {
  const state = useNexus();
  const killSwitch = state.meta.killSwitch === "1";
  const ps = nexus.getPersistenceStatus();
  const warnPersistence = !ps.lastWriteOk || ps.corruptionRecovered;

  return (
    <div className="flex h-full flex-col">
      {warnPersistence && (
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-200">
          <span>⚠</span>
          <span className="truncate">
            {ps.corruptionRecovered ? "Recovered corrupted store — a backup was used. " : ""}
            {!ps.lastWriteOk ? "Writes are failing (likely localStorage quota) — export a backup to avoid data loss." : ""}
          </span>
        </div>
      )}
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r border-nexus-border bg-slate-950/40">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-500 text-slate-950 shadow-lg shadow-cyan-500/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-5 w-5">
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
              <path d="M10 7h4M10 17h4M7 10v4M17 10v4" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-100">NEXUS</div>
            <div className="-mt-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-400/80">Second Brain · v2.0</div>
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
          {SECTIONS.map((section) => (
            <div key={section}>
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{section}</div>
              <div className="space-y-0.5">
                {NAV.filter((n) => n.section === section).map((n) => (
                  <motion.button
                    key={n.id}
                    onClick={() => setPage(n.id)}
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    layout
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      page === n.id ? "bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/30" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                    )}
                  >
                    <motion.span
                      animate={page === n.id ? { scale: [1, 1.15, 1] } : {}}
                      transition={{ duration: 0.3 }}
                      className={cn(page === n.id ? "text-cyan-300" : "text-slate-500")}
                    >
                      {n.icon}
                    </motion.span>
                    {n.label}
                  </motion.button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-nexus-border px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-slate-600">Safety</span>
            {killSwitch ? <Badge tone="rose">● Kill switch</Badge> : <Badge tone="emerald">● Nominal</Badge>}
          </div>
          <div className="mt-1 font-mono text-[10px] text-slate-600">actor: local-operator</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-nexus-border bg-slate-950/30 px-6 py-2.5">
          <div className="font-mono text-[11px] text-slate-500">
            <span className="text-cyan-400/80">●</span> in-browser runtime · all data persists to localStorage · perimeter guard (auth · scopes · rate-limit · payload) enforced
          </div>
          <Badge tone="amber">simulation mode</Badge>
        </div>
        <main className="grid-bg flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
    </div>
  );
}
