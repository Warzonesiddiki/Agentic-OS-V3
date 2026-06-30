# NEXUS 2.0 — Control Plane UX Spec
**Author:** Prism (Frontend/UX Engineer)
**Version:** 0.1-draft (Design Phase)
**Status:** Draft — for Leader review; await Atlas MASTER_SPEC §6 before implementation

---

## 1. Operator Persona & Top 5 Tasks

### Operator Identity
A **DevOps engineer or AI operations lead** who manages a team of 50+ AI agents across multiple projects. They need situational awareness, fast diagnostics, and surgical control. They are comfortable in terminals but need a visual layer for comprehensibility. They trust the system but need to *verify* it.

### Top 5 Tasks (ranked by frequency)

| # | Task | Frequency | Trigger |
|---|---|---|---|
| 1 | **Check agent health** — are all agents alive? Which are stalled? | Every session start + periodic | "Is everything running?" |
| 2 | **Investigate a failure** — find which agent failed, read its last error, replay trace | On-call / incident | Red alert or user report |
| 3 | **Tweak an agent persona** — change an agent's voice, behavior, or scope | Weekly or ad-hoc | "This agent is too verbose" |
| 4 | **Pause/resume/kill an agent** — stop a runaway or stale agent | Occasional (high stakes) | Agent looping or unresponsive |
| 5 | **Inspect memory state** — what does this agent remember? What did it conclude? | Debugging / trust audit | "Why did it decide that?" |

**Design principle:** Every task above must be reachable in ≤3 interactions from the default dashboard view.

---

## 2. Live Agent Map

### What It Shows
A real-time **node graph** of all 50 agents. Each node represents one agent. Edges represent message-passing/IPC channels.

### Node Anatomy
```
  ┌─────────────────────┐
  │  [Icon]  AgentName  │   ← Color-coded status ring
  │  ─────────────────  │   ← Role badge
  │  Role: Architect    │
  │  Status: ● Running  │   ← Live pulse indicator
  │  Tasks: 3 done / 1Q │   ← Queue depth
  │  Memory: 12 cards   │
  └─────────────────────┘
```

### Status Colors (Ring)
| Color | Meaning |
|---|---|
| 🟢 Green | Running, healthy heartbeat |
| 🟡 Amber | Idle > 5 min, possible stall |
| 🔴 Red | Error / crashed / kill pending |
| ⚪ Grey | Paused / suspended |
| 🔵 Blue | Receiving / sending message (animated) |

### Layout
- **Default view:** Force-directed graph (D3 / Cytoscape), auto-clustered by team/role
- **Filter bar:** Toggle visibility by role (Atlas, Forge, Pulse, etc.), status, project
- **Search:** Quick-jump to any agent by name
- **Zoom:** Scroll to zoom, drag to pan, double-click to focus agent
- **Detail panel:** Click any node → right-side drawer opens with full agent detail

### Wireframe (ASCII)
```
┌──────────────────────────────────────────────────────────────────┐
│ [🔍 Search agents...]                    [Filter ▾] [Cluster ▾] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│      [Atlas] ────▶ [Forge] ────▶ [Sentinel]                     │
│         │              │              │                          │
│         ▼              ▼              ▼                          │
│    [Artisan] ◀───── [Pulse] ─────▶ [Mnemosyne]                  │
│         │              │              │                          │
│         ▼              ▼              ▼                          │
│    [Bastion]      [Lorekeeper]      [Prism]                     │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│  [+47 more agents — expand cluster ▾]                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Persona Editor

### Purpose
Allow the operator to edit any agent's **DNA** — the attributes that define its behavior, voice, tools, and constraints — and **hot-reload** without restarting the agent.

### Editable DNA Fields
| Field | Type | Description |
|---|---|---|
| `codename` | string | Display name |
| `voice` | enum | terse / neutral / verbose / narrative |
| `persona` | textarea | Free-text persona description |
| `role` | enum | Architect / Engineer / QA / DevOps / Specialist |
| `tools[]` | multi-select | Which MCP tools this agent can call |
| `rings[]` | checkbox | Ring 0-3 execution privilege level |
| `constraints[]` | textarea | Hard limits (e.g., "never delete files") |
| `model` | dropdown | Preferred model tier |

### Layout
- **Two-column:** Left = live preview of agent card; Right = field editor
- **Diff view:** Before/after when editing; operator must confirm changes
- **Hot-reload button:** "Apply to [AgentName]" — sends mutation via kernel syscall
- **Rollback:** "Revert" restores previous DNA snapshot (kept in memory store)
- **History:** Dropdown of all DNA changes with timestamps (read-only audit)

### Wireframe (ASCII)
```
┌────────────────────────────────────────────────────────────────┐
│ Persona Editor — [Forge]                          [Apply] [×]  │
├─────────────────────────┬──────────────────────────────────────┤
│  AGENT PREVIEW          │  DNA FIELDS                          │
│  ┌───────────────────┐  │  codename: [Forge____________]       │
│  │ ◆ Forge           │  │  voice:    [(●) terse ○ neutral...]  │
│  │ Role: Engineer    │  │  persona:  ┌──────────────────────┐  │
│  │ Status: ● Running │  │  │ The kernel agent...       │  │
│  └───────────────────┘  │  │                          │  │
│                         │  └──────────────────────────┘  │
│  Last DNA change:       │  tools:  ☑ nexus_kill_switch     │
│  2026-06-29 14:22       │         ☑ nexus_agents_spawn     │
│                         │         ☐ nexus_browser_navigate  │
│  [View History]         │  rings:  ☑ Ring 0  ☑ Ring 1       │
│                         │          ☐ Ring 2  ☐ Ring 3       │
└─────────────────────────┴──────────────────────────────────────┘
```

---

## 4. Operator Console

### Purpose
Single pane of glass for **control + inspection** — pause/resume/kill agents, inspect memory, replay traces.

### Sub-panels (tabbed)

#### Tab A: Agent Control
| Action | Button | Safety |
|---|---|---|
| Pause agent | `⏸ Pause` | Confirmation modal |
| Resume agent | `▶ Resume` | Confirmation if was paused > 5 min |
| Kill agent | `☠ Kill` | Hold-to-confirm (1.5s) + typed confirmation |

#### Tab B: Memory Inspector (partner: Mnemosyne)
- Shows all memory cards for the selected agent
- Each card: kind badge, content preview, confidence bar, timestamp
- Click card → full detail modal with evidence array and decay graph
- Search within memory: filter by kind, keyword, date range

#### Tab C: Trace Replay (partner: Pulse)
- Chronological waterfall of agent events
- Each event: timestamp, type (tool_call / message / decision / error), duration
- Expandable nodes → full input/output/prompt for each step
- Export trace as JSON for post-mortem

### Wireframe (ASCII)
```
┌────────────────────────────────────────────────────────────────┐
│ Operator Console — [Forge ▾]           [Agent Ctrl] [Memory] [Trace] │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  AGENT CONTROL                                                │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                        │
│  │  ⏸ Pause│  │  ▶ Resume│  │  ☠ Kill │  ← Hold 1.5s        │
│  └─────────┘  └─────────┘  └─────────┘                        │
│                                                                │
│  TRACE REPLAY (last 30 events)                                 │
│  14:22:01.234  ● tool_call  nexus_kill_switch     45ms       │
│  14:22:01.280  ● decision    [approved/denied]       12ms     │
│  14:22:01.292  ● message    → Lorekeeper           88ms      │
│  14:22:01.380  ● error      E_RETRY_EXHAUSTED      —        │
│                          [▼ expand] [Export JSON]            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 5. Information Architecture

### Sidebar Navigation (always visible)
```
┌──────────────┐
│ ◆ NEXUS 2.0  │   ← Logo / home
├──────────────┤
│ 🗺 Agent Map │   ← Live agent map (default view)
│ 🎭 Personas │   ← Persona editor
│ ⌨ Console    │   ← Operator console
│ 🧠 Memories  │   ← Memory browser (Mnemosyne)
│ 📋 Skills    │   ← Skills management
│ 📊 Audit     │   ← Audit chain viewer
│ ⚡ Safety    │   ← Kill switch + health
├──────────────┤
│ 📡 Events    │   ← Live event ticker (SSE)
│ ⚙ Settings   │   ← User/instance config
└──────────────┘
```

### Command Palette (Ctrl+K / Cmd+K)
- Fuzzy search across all views, agents, actions
- Examples: `>pause forge`, `>memory Pr* last 24h`, `>kill pulse`, `>persona forge`
- Shows recent commands; keyboard navigable

### Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `Ctrl+K` / `⌘K` | Open command palette |
| `Ctrl+/` / `⌘/` | Toggle sidebar |
| `Escape` | Close modal / deselect |
| `G M` | Go to Agent Map |
| `G P` | Go to Personas |
| `G C` | Go to Console |
| `Ctrl+.` | Pause selected agent |
| `Ctrl+Shift+.` | Kill selected agent |
| `R` | Refresh all views |

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
  --status-warn:  #FBBF24;   /* Amber — attention */
  --status-err:   #F87171;   /* Red — error/kill */
  --status-idle:  #9CA3AF;   /* Grey — paused */
  --status-msg:   #60A5FA;   /* Blue — messaging */

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
| **AgentNode** | default, hover, selected, error, pulsing | Circular avatar + status ring |
| **StatusBadge** | ok, warn, err, idle, msg | Pill shape, color-coded |
| **ActionButton** | default, hover, active, loading, disabled | 32px height, rounded-lg |
| **HoldToConfirm** | idle, holding, confirmed | 1.5s hold progress ring |
| **Drawer** | open, closed | Slide from right, 400px wide |
| **Modal** | open, closed | Centered, backdrop blur |
| **TraceRow** | collapsed, expanded, error | Expandable tree node |
| **MemoryCard** | default, hover, selected | Kind badge + confidence bar |
| **CommandPalette** | open, searching, result-selected | Fuzzy search, keyboard nav |
| **Toast** | info, success, warning, error | Bottom-right stack |
| **ConfirmDialog** | open | For pause/resume — lightweight |

### Motion / Animation
- **Page transitions:** Fade + slight Y-translate, 150ms ease-out
- **Agent node pulse:** CSS keyframe, 2s infinite for active messaging
- **Drawer slide:** 200ms ease-out from right
- **Modal appear:** Scale 0.95→1.0 + fade, 150ms
- **Status change:** Color transition 300ms + brief scale pulse 1.0→1.05→1.0
- **Trace expand:** Height auto-animate, 200ms ease-out

---

## 7. Privacy & Review Notes

⚠️ **Sentinel Review Required:**
- Memory Inspector panel surfaces user data → must route through Sentinel privacy filter before rendering
- Trace Replay may contain tool arguments with sensitive data → redact before display
- Audit Log viewer is read-only but shows actor + action → confirm no PII exposure

---

## 8. v1 Scope (Boring-but-clear)

For v1, ship only:
1. Agent Map (node graph, status colors, click-to-select)
2. Sidebar navigation
3. Agent detail drawer (read-only — status, role, last event)
4. Operator Console — Agent Control tab (pause/resume/kill with hold-to-confirm)
5. Command palette (basic — navigate to views)
6. Visual language tokens and base components

**Deferred to v2:** Persona Editor hot-reload, Memory Inspector, Trace Replay, full keyboard shortcuts, diff/history on persona changes.

---

*End of UX Spec — Prism. Awaiting Atlas MASTER_SPEC §6 for implementation alignment.*
