# Story E6-S3 — Approval inbox and safe decision UX

**Epic:** E6
**Priority:** P0
**Estimate:** 5
**Status:** done
**Sprint:** sprint-5

## Acceptance criteria
- [x] List shows risk, action, project, agent, expiry, and “no side effect yet.”
- [x] Detail shows plain-language effect, exact redacted operation, policy reason, identity, and evidence.
- [x] Approve button names the side effect; deny is equally accessible.
- [x] Focus management, keyboard flow, escape behavior, and screen-reader labels are correct.
- [x] Stale/mismatched decision errors explain that the action must be refreshed.

## Implementation
- `R1ApprovalInbox`:
  - Loads approvals via `r1.listApprovals(projectId)` polling every 3s.
  - List row: amber pending badge, risk badge rose/amber based on riskReason, tool mono, proposed args count, project/agent/expiry/no side effect yet.
  - Card role=button, tabIndex=0, aria-label with tool and risk, Enter opens dialog.
  - Dialog: HTML dialog element, ref, showModal on selected, focus management heading tabIndex=-1 focused on open, backdrop, escape key closes via onKeyDown.
  - Detail sections: What will happen? plain-language, Exact operation (redacted) pre JSON redactedArgs, Why approval required? policy version rule, Who asked? principal/agent/task/correlation, Safety action hash slice, policy version, expiry, no side effect yet amber.
  - Buttons: Approve `tool` primary with aria-label `Approve write to ...`, Deny danger equally accessible, Close ghost.
  - Decide calls `r1.decideApproval` with decision, actionHash, policyVersion; on error shows alert explaining refresh needed (stale/mismatch).
  - Focus returns to trigger on close (dialog close).
  - Screen-reader: role dialog aria-modal, heading focused, alert role for errors.
  - Server validation ensures deny produces no side effect (gateway checks approval).

## Evidence
- src/components/r1/R1Approvals.tsx
- src/lib/r1-client.ts
- server/src/routes/r1-extended.ts

## Validation
- Keyboard-only approval flow completes, escape does not approve, approve button names side effect.
