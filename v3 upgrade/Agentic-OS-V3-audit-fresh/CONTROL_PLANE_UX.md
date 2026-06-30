# NEXUS 2.0 — Control Plane UX Spec
**Author:** Prism · Frontend/UX Engineer
**Version:** 0.1-draft
**Status:** Draft — awaiting Atlas MASTER_SPEC §6 for implementation alignment
**File:** `CONTROL_PLANE_UX.md` (workspace root)

---

## 1. Operator Persona

### Who Is the Operator?
A **DevOps engineer or AI operations lead** managing 50+ agents across multiple concurrent projects. Comfortable in terminals; needs a visual layer for comprehensibility and trust. Acts as the human-in-the-loop for safety-critical decisions. Trusts the system but needs to *verify* it.

### Top 5 Tasks (ranked by frequency)

| # | Task | Frequency | Trigger |
|---|---|---|---|
| 1 | **Check agent health** — are all agents alive? Which are stalled? | Every session + periodic | "Is everything running?" |
| 2 | **Investigate a failure** — which agent failed, last error, replay trace | On-call / incident | Red alert or user report |
| 3 | **Tweak an agent persona** — change voice, behavior, or tool scope | Weekly / ad-hoc | "This agent is too verbose" |
| 4 | **Pause/resume/kill an agent** — stop a runaway or stale agent | Occasional (high stakes) | Agent looping or unresponsive |
| 5 | **Inspect memory state** — what does this agent remember? | Debugging / trust audit | "Why did it decide that?" |

**Design principle:** Every task reachable in ≤3 interactions from the default dashboard view.

---

## 2. Live Agent Map

### What It Shows
A real-time **node graph** of all 50 agents. Each node = one agent. Edges = message-passing / IPC channels.

### Node Anatomy
```
┌─────────────────────┐
│  [Icon]  AgentName  │  ← Status ring (color-coded)
│  ─────────────────  │
│  Role: Architect    │
│  Status: ● Running  │  ← Live pulse on messaging
│  Tasks: 3 done / 1Q │  ← Queue depth
│  Memory: 12 cards   │
└─────────────────────┘
```

### Status Ring Colors
| Color | Meaning |
|---|---|
| 🟢 Green | Running, healthy heartbeat |
| 🟡 Amber | Idle > 5 min, possible stall |
| 🔴 Red | Error / crashed / kill pending |
| ⚪ Grey | Paused / suspended |
| 🔵 Blue | Receiving / sending (animated pulse) |

### Layout
- **Default:** Force-directed graph (D3/Cytoscape), auto-clustered by team/role
- **Filter bar:** Toggle by role, status, project
- **Search:** Quick-jump to any agent by name
- **Zoom/pan:** Scroll to zoom, drag to pan, double-click to focus node
- **Detail panel:** Click node → right-side drawer with full agent detail

### ASCII Wireframe
```
┌─────────────────────────────────────────────────────────────┐
│ [🔍 Search agents...]          [Filter ▾]  [Cluster ▾]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     [Atlas] ────▶ [Forge] ────▶ [Sentinel]                 │
│        │              │              │                      │
│        ▼              ▼              ▼                      │
│   [Artisan] ◀──── [Pulse] ─────▶ [Mnemosyne]              │
│        │              │              │                      │
│        ▼              ▼              ▼                      │
│   [Bastion]     [Lorekeeper]       [Prism]                 │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  [+47 more agents — expand cluster ▾]                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Persona Editor

### Purpose
Edit any agent's **DNA** — attributes defining behavior, voice, tools, constraints — and **hot-reload without restart**.

### Editable DNA Fields
| Field | Type | Description |
|---|---|---|
| `codename` | string | Display name |
| `voice` | enum | terse / neutral / verbose / narrative |
| `persona` | textarea | Free-text persona description |
| `role` | enum | Architect / Engineer / QA / DevOps / Specialist |
| `tools[]` | multi-select | MCP tools this agent may call |
| `rings[]` | checkbox | Ring 0–3 execution privilege level |
| `constraints[]` | textarea | Hard limits (e.g., "never delete files") |
| `model` | dropdown | Preferred model tier |

### Layout & Interactions
- **Two-column:** Left = live agent card preview; Right = DNA field form
- **Diff view:** Before/after on edit; operator confirms before commit
- **Hot-reload:** "Apply to [AgentName]" button → sends mutation via kernel syscall
- **Rollback:** "Revert" restores previous DNA snapshot (kept in memory store)
- **History:** Dropdown of all DNA changes with timestamps (read-only audit log)
- **Mnemosyne partnership:** DNA changes are stored as reflexion memory cards automatically

### ASCII Wireframe
```
┌──────────────────────────────────────────────────────────────┐
│ Persona Editor — [Forge]                        [Apply] [×] │
├────────────────────────┬─────────────────────────────────────┤
│  AGENT PREVIEW         │  DNA FIELDS                         │
│  ┌──────────────────┐  │  codename: [Forge___________]       │
│  │ ◆ Forge          │  │  voice:   (●) terse ○ neutral...    │
│  │ Role: Engineer   │  │  persona: ┌─────────────────────┐   │
│  │ Status: ● Running│  │  │ The kernel agent...      │   │
│  └──────────────────┘  │  └─────────────────────────────┘   │
│                        │  tools:  ☑ nexus_kill_switch        │
│  Last DNA change:       │         ☑ nexus_agents_spawn        │
│  2026-06-29 14:22      │         ☐ nexus_browser_navigate     │
│                        │  rings:  ☑ Ring 0  ☑ Ring 1         │
│  [View History ▾]       │          ☐ Ring 2  ☐ Ring 3        │
└────────────────────────┴─────────────────────────────────────┘
```

---

## 4. Operator Console

### Purpose
Single pane of glass for **control + inspection** — pause/resume/kill agents, inspect memory, replay traces.

### Sub-panels (tabbed interface)

#### Tab A: Agent Control
| Action | Button | Safety Mechanism |
|---|---|---|
| Pause agent | `⏸ Pause` | Confirmation modal |
| Resume agent | `▶ Resume` | Confirmation if paused > 5 min |
| Kill agent | `☠ Kill` | Hold-to-confirm (1.5s) + typed confirmation |

#### Tab B: Memory Inspector *(partner: Mnemosyne)*
- All memory cards for the selected agent
- Each card: kind badge, content preview, confidence bar, timestamp
- Click card → full detail modal with evidence array + decay graph
- Search/filter by kind, keyword, date range

#### Tab C: Trace Replay *(partner: Pulse)*
- Chronological waterfall of agent events
- Each event: timestamp, type (tool_call / message / decision / error), duration
- Expandable nodes → full input/output/prompt for each step
- Export trace as JSON for post-mortem analysis

### ASCII Wireframe
```
┌──────────────────────────────────────────────────────────────┐
│ Operator Console — [Forge ▾]    [Agent Ctrl] [Memory] [Trace]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  AGENT CONTROL                                               │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                       │
│  │ ⏸ Pause │  │ ▶ Resume │  │ ☠ Kill  │  ← Hold 1.5s       │
│  └─────────┘  └─────────┘  └─────────┘                       │
│                                                              │
│  TRACE REPLAY (last 30 events)                               │
│  14:22:01.234  ● tool_call  nexus_kill_switch    45ms       │
│  14:22:01.280  ● decision   [approved/denied]      12ms     │
│  14:22:01.292  ● message    → Lorekeeper           88ms     │
│  14:22:01.380  ● error     E_RETRY_EXHAUSTED      —        │
│                          [▼ expand]  [Export JSON]          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Information Architecture

### Sidebar Navigation (always visible)
```
┌────────────────┐
│  ◆ NEXUS 2.0   │   ← Logo / home (returns to map)
├────────────────┤
│  🗺  Agent Map │   ← Live agent map (default view)
│  🎭  Personas  │   ← Persona editor
│  ⌨  Console    │   ← Operator console
│  🧠  Memories  │   ← Memory browser (Mnemosyne)
│  📋  Skills    │   ← Skills management
│  📊  Audit     │   ← Audit chain viewer
│  ⚡  Safety    │   ← Kill switch + system health
├────────────────┤
│  📡  Events    │   ← Live event ticker (SSE stream)
│  ⚙  Settings   │   ← Instance / operator config
└────────────────┘
```

### Command Palette (`Ctrl+K` / `⌘K`)
- Fuzzy search across all views, agents, actions
- Examples: `>pause forge`, `>memory Pr* 24h`, `>kill pulse`, `>persona forge`
- Shows recent commands; keyboard navigable (↑↓ Enter Esc)

### Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `Ctrl+K` / `⌘K` | Open command palette |
| `Ctrl+/` / `⌘/` | Toggle sidebar collapse |
| `Escape` | Close modal / deselect |
| `G M` | Go to Agent Map |
| `G P` | Go to Personas |
| `G C` | Go to Console |
| `Ctrl+.` | Pause selected agent |
| `Ctrl+Shift+.` | Kill selected agent |
| `R` | Refresh all live views |

---

## 6. Visual Language

### Color Tokens (CSS custom properties)
```css
:root {
  /* Backgrounds */
  --bg-base:      #0D0F14;   /* Deep navy — primary background */
  --bg-surface:   #151821;   /* Cards, panels */
  --bg-elevated:  #1C2030;   /* Modals, dropdowns */
  --bg-hover:     #252A3A;   /* Hover state */

  /* Status */
  --status-ok:    #34D399;   /* Green — healthy */
  --status-warn:  #FBBF24;   /* Amber — attention needed */
  --status-err:   #F87171;   /* Red — error / kill */
  --status-idle:  #9CA3AF;   /* Grey — paused */
  --status-msg:  #60A5FA;   /* Blue — messaging active */

  /* Accent */
  --accent:       #A78BFA;   /* Violet — NEXUS brand */
  --accent-glow:  rgba(167, 139, 250, 0.25);

  /* Text */
  --text-primary:   #F9FAFB;
  --text-secondary: #9CA3AF;
  --text-muted:     #6B7280;

  /* Borders */
  --border:        #2D3348;
  --border-focus:  #A78BFA;
}
```

### Typography
| Role | Font | Size | Weight |
|---|---|---|---|
| Display / Logo | Inter | 20px | 700 |
| Page heading | Inter | 18px | 600 |
| Section heading | Inter | 14px | 600 |
| Body text | Inter | 13px | 400 |
| Code / trace | JetBrains Mono | 12px | 400 |
| Label / badge | Inter | 11px | 500 |
| Timestamp | JetBrains Mono | 11px | 400 |

### Component Inventory

| Component | States | Notes |
|---|---|---|
| **AgentNode** | default, hover, selected, error, pulsing | Circular avatar + status ring; animated on msg |
| **StatusBadge** | ok, warn, err, idle, msg | Pill shape, color-coded |
| **ActionButton** | default, hover, active, loading, disabled | 32px height, rounded-lg |
| **HoldToConfirm** | idle, holding (progress ring), confirmed | 1.5s hold; aborts on release |
| **Drawer** | open, closed | Slide from right, 400px wide |
| **Modal** | open, closed | Centered, backdrop blur |
| **TraceRow** | collapsed, expanded, error | Expandable tree node |
| **MemoryCard** | default, hover, selected | Kind badge + confidence bar |
| **CommandPalette** | open, searching, result-selected | Fuzzy search, keyboard nav |
| **Toast** | info, success, warning, error | Bottom-right stack, auto-dismiss |
| **ConfirmDialog** | open | Lightweight confirmation for pause/resume |
| **DiffViewer** | — | Side-by-side for persona DNA changes |

### Motion & Animation
- **Page transitions:** Fade + Y-translate (8px → 0), 150ms ease-out
- **Agent node pulse:** CSS keyframe, 2s infinite (on `status-msg` active)
- **Drawer slide:** 200ms ease-out from right
- **Modal appear:** Scale 0.95→1.0 + fade, 150ms
- **Status change:** Color transition 300ms + scale pulse 1.0→1.05→1.0
- **Trace expand:** Height auto-animate, 200ms ease-out
- **HoldToConfirm ring:** SVG stroke-dashoffset countdown, 1.5s

---

## 7. Privacy & Sentinel Review

⚠️ **Flagged for Sentinel review:**
- **Memory Inspector** → surfaces user data; must route through Sentinel privacy filter before rendering
- **Trace Replay** → tool arguments may contain sensitive data; redact before display
- **Audit Log viewer** → read-only but shows actor + action; confirm no PII leakage

---

## 8. v1 Scope (Boring-but-Clear)

Ship only for v1:
1. ✅ Agent Map (node graph, 5-status colors, click-to-select, filter bar, search)
2. ✅ Sidebar navigation
3. ✅ Agent detail drawer (read-only — status, role, last event)
4. ✅ Operator Console — Agent Control tab only (pause/resume/kill with HoldToConfirm)
5. ✅ Command palette (basic navigation only)
6. ✅ Visual language tokens + base components

**Deferred to v2:**
- Persona Editor hot-reload
- Memory Inspector tab
- Trace Replay tab
- Full keyboard shortcut suite
- DNA change history / diff view
- Cluster expand/collapse for +47 hidden agents

---

*End of CONTROL_PLANE_UX.md — Prism. Awaiting Atlas MASTER_SPEC §6.*
