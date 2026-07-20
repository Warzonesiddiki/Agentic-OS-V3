# BMAD UX Design — NEXUS 2.0 / Agentic OS V3

**Date:** 2026-07-21  
**Status:** Draft for architecture and implementation planning  
**Source:** `docs/bmad/04-prd.md`  
**Design target:** R1 Governed Agent Workbench vertical slice

## 1. UX concept

NEXUS should feel like a calm operations console for AI work, not a chat window with hidden automation. The central experience is a visible task lifecycle:

**Context → Plan → Approval → Execution → Evidence → Outcome → Learning**

The interface must answer three questions at every point:

1. **What is happening now?**
2. **What can the developer safely do next?**
3. **What evidence explains the state?**

## 2. Existing product surface to preserve

The repository already has a dark control-plane visual language, a persistent shell, lazy routes, page-level error boundaries, offline/remote indicators, safety status, and pages for memories, recall, kernel, approvals, audit, analytics, reliability, settings, and developer documentation.

R1 should extend this surface rather than create a parallel application:

- Keep the existing shell, navigation grouping, status badges, responsive card primitives, and reduced-motion behavior.
- Make the R1 golden path discoverable from Dashboard and Kernel/Tasks.
- Add task detail and approval detail routes only where the current pages cannot provide durable deep links.
- Avoid showing a feature as live when it is local simulation or unavailable in the selected mode.

## 3. Information architecture

### Primary navigation for R1

| Area | User job | R1 entry |
|---|---|---|
| **Dashboard** | See what needs attention and start work | `/dashboard` |
| **Project** | Choose local/shared project and inspect mode | `/projects` |
| **Memory** | Search, inspect, correct, and forget context | `/memories`, `/recall` |
| **Tasks** | Start, monitor, inspect, cancel, retry, and recover work | `/kernel`, `/tasks/:taskId` |
| **Approvals** | Review exact proposed side effects | `/approvals`, `/approvals/:approvalId` |
| **Evidence** | Inspect audit, receipts, traces, and export | `/audit`, `/tasks/:taskId?tab=evidence` |
| **Safety** | Inspect policy, kill switch, and capability status | `/safety`, `/settings` |
| **Developer** | Configure provider, MCP/A2A adapters, and local CLI | `/settings`, `/docs`, `/cli` |

Existing advanced pages such as marketplace, federated features, enterprise administration, and experimental self-optimization remain available only when their backend capability is genuinely present. They should not compete with the R1 primary navigation.

## 4. Global shell behavior

### Header/status strip

Always visible:

- Project name and scope indicator.
- `local-only`, `shared`, `syncing`, or `offline` mode.
- Backend/provider/embedding status with a link to details.
- Pending approvals count.
- Kill switch status.
- Event stream connection state.

Status colors are not the only signal; every badge has text and accessible labels.

### Global action rules

- Destructive actions use a confirmation step that names the scope and affected object.
- Approve/deny buttons never appear without the action summary and risk reason nearby.
- A disabled button explains why it is unavailable.
- Every mutation shows a toast plus a persistent state update; toasts are not the only confirmation.
- Browser reload preserves the current deep link and task/approval state.

## 5. R1 screens

### 5.1 Dashboard — attention-first home

**Purpose:** Help the developer begin or resume work within 30 seconds.

**Layout**

1. **Project context card**
   - Project name, local/shared mode, last sync, health.
   - `Start task` primary action.
   - `Import context` and `Export project` secondary actions.
2. **Needs attention row**
   - Pending approvals.
   - Failed/recoverable tasks.
   - Sync conflicts.
   - Audit/safety warnings.
3. **Active work panel**
   - Task name, current step, elapsed time, agent, progress state, latest event.
   - `Open task` deep link.
4. **Recent evidence panel**
   - Latest completed tasks and reusable memory/skill proposals.
5. **Capability health**
   - Provider, embeddings, storage, tool gateway, and event stream.

**Empty state:** “Initialize a project to run your first governed task.” Provide a three-step setup checklist.

### 5.2 Project initialization

**Entry:** Dashboard empty state or Projects → New project.

**Steps**

1. Name and local directory/scope.
2. Choose local-only or connect shared backend.
3. Review data and telemetry defaults.
4. Choose initial capabilities from a small safe set.
5. Confirm and show project ID/export key guidance.

The wizard must show that the default tool set is bounded and that external content is not automatically trusted.

### 5.3 Start task drawer

**Purpose:** Define a bounded task without hiding the execution contract.

**Fields**

- Task goal.
- Project scope (locked or explicit).
- Agent/runtime choice.
- Memory context mode: automatic scoped recall, selected memories, or none.
- Allowed capabilities (checkboxes with risk levels).
- Time/attempt budget.
- Approval policy preview.

**Before start summary**

> This task can read project files, may propose file writes, and cannot access credentials or unrelated projects. File writes require approval.

Primary action: **Start governed task**. Secondary: **Save as draft**.

### 5.4 Task detail — execution timeline

**Header**

- Task title and status badge.
- Project, agent identity, started/updated time.
- Cancel/retry/recover action based on state.
- Cost/token/elapsed summary when available.

**Main timeline**

Each step is a row/card with:

- Step number and type: recall, model, approval, tool, compensation, result.
- State: queued, running, waiting, succeeded, failed, skipped.
- Duration and attempt count.
- Human-readable summary.
- Evidence links: memory IDs, approval ID, receipt ID, trace ID.
- Expandable redacted input/output.

**Right rail or lower tabs**

- **Overview:** goal, policy, capabilities, current state.
- **Evidence:** audit entries, receipts, traces, provenance.
- **Recovery:** valid actions and why invalid actions are disabled.
- **Memory:** context used and candidate memories.

**Running state:** Show latest event and a calm “agent is working” indicator; do not imply exact progress when the runtime cannot calculate it.

**Waiting approval state:** Move the approval card to the top of the timeline and make the next action obvious.

**Failed state:** Show classification, safe next actions, last checkpoint, and whether a side effect was committed.

### 5.5 Approval inbox

**Purpose:** Review risk, not merely click through prompts.

**List row**

- Risk badge.
- Proposed action in plain language.
- Tool and project.
- Agent identity.
- Created/expiry time.
- Scope of effect.
- “No side effect yet” status.

**Approval detail**

1. **What will happen?** Plain-language summary.
2. **Exact operation:** Tool name and structured arguments; secrets redacted.
3. **Why is approval required?** Policy rule and risk category.
4. **Who asked?** Principal/agent identity, project, task, and trace.
5. **What can change?** Files/records/network targets shown as bounded list.
6. **Decision:** Approve, deny, or edit if supported.
7. **Evidence:** Action hash, policy version, and expiry.

Approve button label should include the side effect, for example **Approve write to 2 project files**, not simply “Approve”.

### 5.6 Memory and recall

**Memory list**

- Search field with scope selector.
- Type, confidence, freshness, provenance, and lifecycle filters.
- Cards show a short content preview and evidence source.
- Actions: inspect, correct, archive, forget, mark useful/not useful.

**Recall view**

- Query, token budget, selected scope, retrieval mode.
- Result cards show rank, score components where available, provenance, and why it was included.
- Display “lexical fallback” as an informative mode badge, not an error.
- Allow result feedback without confusing feedback with truth.

### 5.7 Evidence and export

- Evidence timeline can be opened from a task, audit, or receipt.
- Export dialog includes scope, record types, date range, redaction status, and schema version.
- Before download, show a summary: records included, records omitted, secrets redacted, and integrity hash.
- Import uses a dry-run preview: additions, updates, conflicts, rejected records.

## 6. State language and visual semantics

| State | Meaning | User-facing treatment |
|---|---|---|
| Queued | Accepted, not started | Neutral badge; show queue position if reliable. |
| Running | Active execution | Cyan/blue; show latest step, not fake percentage. |
| Waiting approval | Safe pause before side effect | Amber; pin to attention surfaces. |
| Waiting input | Agent needs developer response | Amber; show exact question and resume action. |
| Retrying | Recoverable operation is being retried | Violet/amber; show attempt count and next retry. |
| Compensating | Undo/recovery action is running | Amber; explain that original task is not successful yet. |
| Completed | All required steps committed | Emerald; show evidence and reusable outcome option. |
| Failed | Task ended without success | Rose; classify and show safe recovery. |
| Canceled | User/system stopped task | Slate; show whether any side effect committed. |
| Quarantined | Safety boundary blocked further work | Rose; explain required operator action. |
| Degraded | Feature works with reduced capability | Amber; identify missing provider/backend/embedding. |

Never use green solely because a request returned HTTP 200; completion means the domain task outcome is committed.

## 7. Error and empty states

Every R1 surface implements:

- **Loading:** skeleton preserving approximate layout.
- **Empty:** explain why there is no data and offer the next safe action.
- **Offline/local:** show whether data is local and whether sync is pending.
- **Permission denied:** identify the missing scope without exposing policy internals.
- **Provider unavailable:** offer lexical/no-provider path where safe.
- **Conflict:** show both versions and require explicit resolution.
- **Unknown failure:** show trace ID and safe retry/export-log action, not a raw stack.

## 8. Accessibility requirements

- Keyboard access to all navigation, drawers, dialogs, tabs, and timeline expansion.
- Focus moves to the dialog heading on open and returns to the trigger on close.
- Focus is trapped in approval dialogs and escape does not approve or execute.
- `aria-current="page"` for navigation.
- `aria-live="polite"` for task state changes; do not announce every streaming token.
- Color is paired with text/icon and meets contrast targets.
- Reduced-motion mode disables decorative background and nonessential transitions.
- Monospace IDs and hashes remain selectable and readable at zoom.
- Destructive confirmation includes a non-time-based alternative to hold gestures.

## 9. Responsive behavior

### Desktop

Three-column task detail is allowed: timeline, evidence, action rail.

### Tablet

Collapse evidence into tabs; keep action rail sticky.

### Mobile/narrow window

- Stack cards.
- Keep project/safety/status strip visible.
- Use bottom-sheet or full-screen approval detail.
- Put the primary action at the bottom with safe-area padding.
- Never hide the reason an action is blocked behind hover.

## 10. Interaction contracts

### Approval contract

The UI may request a decision but never executes the action itself. The server revalidates action hash, scope, policy version, expiry, and kill switch state.

### Task contract

The UI treats server/local task state as authoritative and renders event updates idempotently. Optimistic actions are allowed only for non-side-effecting view changes; approve, deny, cancel, retry, and recover wait for confirmed state.

### Memory contract

The UI distinguishes `source`, `derived`, `user-confirmed`, and `candidate` memory. A feedback click changes feedback, not the memory's truth status.

### Offline contract

The UI always labels whether an operation is local-only, queued for sync, synchronized, or conflicted. It never says “saved to server” when the backend was unreachable.

## 11. UX telemetry

Capture interaction metadata without content by default:

- Time from task start to first useful state.
- Approval open-to-decision duration.
- Deny/edit/approve rates by risk class.
- Task detail open after failure.
- Recovery action success.
- Recall feedback and result expansion.
- Export/import completion and conflict resolution.
- Accessibility errors in automated checks.

Do not capture raw prompt, memory, tool arguments, or file content in UX analytics.

## 12. UX acceptance checklist

- A first-time developer can initialize a local project without reading architecture docs.
- A developer can start a task and understand its allowed capabilities before execution.
- A risky tool action is visibly paused before side effects.
- Approval survives reload and is deep-linkable.
- A failed task shows a valid recovery action and last checkpoint.
- A task timeline links to evidence without requiring raw logs.
- Offline and degraded modes are understandable.
- Keyboard-only users can complete the approval flow.
- No route displays simulated data as live backend data.
- The golden path can be completed from Dashboard → Task → Approval → Evidence.

## 13. UX handoff to architecture

Architecture must provide:

1. Stable deep-linkable project, task, approval, memory, receipt, and evidence IDs.
2. Server/local event contract with replay-safe event IDs.
3. Typed state machine and valid action matrix for each state.
4. Redaction metadata and safe field projection for UI.
5. Capability/health model that distinguishes unavailable from empty.
6. Export dry-run and conflict preview APIs.
7. Responsive task and approval payloads that do not require the UI to join raw database tables.
