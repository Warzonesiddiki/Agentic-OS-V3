# Story E6-S1 — R1 dashboard and project setup UX

**Epic:** E6 Control plane and developer workbench
**Priority:** P1
**Estimate:** 5
**Status:** done
**Sprint:** sprint-5

## Acceptance criteria
- [x] Dashboard shows project mode, health, pending approvals, active/recoverable tasks, and capability status.
- [x] Empty state guides project initialization.
- [x] Setup wizard explains local/shared mode and safe defaults.
- [x] Loading, empty, offline, degraded, error, and permission states are implemented.
- [x] Keyboard and screen-reader checks pass for setup and primary actions.

## Implementation
- Component `src/components/r1/R1Dashboard.tsx`:
  - Uses `r1-client` to inspectProject, listApprovals, listTasks, telemetry.
  - Project context card: name, mode badge (local only emerald, shared cyan), degraded amber, ID mono, health grid (storage healthy, provider healthy, embedding healthy, syncState).
  - Actions: Start task (primary), Export (secondary) with Blob download.
  - Needs attention row: pending approvals count amber, failed/recoverable rose, active work cyan, each with navigation.
  - Active work panel: lists active tasks (queued, running, waiting_approval, retrying) with state badge, title, updated time, Open button.
  - Capability health grid: provider, embeddings, storage, tool gateway, event stream.
  - States:
    - Loading: animate-pulse skeletons, aria-busy, aria-live polite.
    - Empty: no project selected card with Initialize project button, checklist, error alert.
    - Offline: navigator.onLine false shows offline banner, local mode usable message.
    - Degraded: amber badge when storage/provider/embedding unhealthy.
    - Error: rose card with role=alert.
    - Permission: fallback to empty if 403.
  - Setup wizard: dialog role=dialog aria-modal, explains local-only vs shared, safe defaults border, keyboard accessible, focus on heading.
  - Keyboard: all buttons focusable, dialog escape closes.
  - Screen-reader: aria labels, role main, live regions.
- Router: `/dashboard` -> R1DashboardWrapper, `/r1/dashboard` same, legacy at `/dashboard-legacy`.
- Shell navigation adds R1 Governed section with R1 Dashboard, Start Task, R1 Approvals, R1 Memory Workbench.

## Evidence
- src/components/r1/R1Dashboard.tsx
- src/lib/r1-client.ts
- src/router.tsx
- src/components/Shell.tsx

## Validation
- Manual check: keyboard-only flow, screen-reader labels, offline via navigator.onLine mock, degraded via status.
