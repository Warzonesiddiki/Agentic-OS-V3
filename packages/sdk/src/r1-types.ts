/**
 * R1 Shared Domain Types & State Enums (BMAD Story E0-S2)
 * ------------------------------------------------------------------
 * Canonical, versioned vocabulary for projects, tasks, approvals,
 * capabilities, receipts, and evidence. Shared by the server, the
 * frontend, and the SDK so local, server, and UI code cannot drift.
 *
 * Design rules (from the story acceptance criteria):
 *  - Every external JSON payload is parsed at a boundary via the exported
 *    zod schemas. No domain function accepts unvalidated `unknown` data.
 *  - Valid transitions and invalid-transition errors are explicit and
 *    exhaustively covered by the contract tests in `r1-types.test.ts`.
 *  - No provider/driver-specific fields leak into these types.
 *
 * @packageDocumentation
 */
import { z } from 'zod';

/** R1 domain contract version. Bump on any breaking change to these types. */
export const R1_DOMAIN_VERSION = '1.0.0' as const;

/* ------------------------------------------------------------------ *
 * Project
 * ------------------------------------------------------------------ */

export const ProjectModeSchema = z.enum(['local', 'shared']);
export type ProjectMode = z.infer<typeof ProjectModeSchema>;

export const ProjectSyncStateSchema = z.enum(['idle', 'syncing', 'error', 'disabled']);
export type ProjectSyncState = z.infer<typeof ProjectSyncStateSchema>;

/** Health/operational status reported for a project scope (E1-S1 AC3). */
export const ProjectStatusSchema = z.object({
  mode: ProjectModeSchema,
  storageHealthy: z.boolean(),
  providerHealthy: z.boolean(),
  embeddingHealthy: z.boolean(),
  syncState: ProjectSyncStateSchema,
});
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectSchema = z.object({
  /** Stable opaque UUID. Never reuse or expose internal row ids. */
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  mode: ProjectModeSchema,
  /** Root/scope metadata (e.g. local root path, tenant id). */
  scope: z.record(z.string()),
  /** Idempotency key used to make initialization repeatable (E1-S1 AC2). */
  idempotencyKey: z.string().min(1).max(255).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

/* ------------------------------------------------------------------ *
 * Task state machine
 * ------------------------------------------------------------------ */

export const TaskStateSchema = z.enum([
  'queued',
  'waiting_approval',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type TaskState = z.infer<typeof TaskStateSchema>;

export type TaskEvent =
  | 'admit'
  | 'require_approval'
  | 'approve'
  | 'deny'
  | 'complete'
  | 'fail'
  | 'cancel';

export const TaskEventSchema = z.enum([
  'admit',
  'require_approval',
  'approve',
  'deny',
  'complete',
  'fail',
  'cancel',
]);

/**
 * Exhaustive transition table for the governed task lifecycle.
 * Terminal states (`completed` / `failed` / `cancelled`) have no outgoing
 * edges. Any (state, event) pair absent here is an invalid transition.
 */
export const TASK_TRANSITIONS: Readonly<
  Record<TaskState, Readonly<Partial<Record<TaskEvent, TaskState>>>>
> = {
  queued: { admit: 'running', require_approval: 'waiting_approval', cancel: 'cancelled' },
  waiting_approval: { approve: 'running', deny: 'cancelled', cancel: 'cancelled' },
  running: { complete: 'completed', fail: 'failed', cancel: 'cancelled' },
  completed: {},
  failed: {},
  cancelled: {},
};

export class InvalidTaskTransitionError extends Error {
  constructor(
    public readonly from: TaskState,
    public readonly event: TaskEvent,
  ) {
    super(`Invalid task transition: ${from} --${event}--> (no such transition)`);
    this.name = 'InvalidTaskTransitionError';
    Object.setPrototypeOf(this, InvalidTaskTransitionError.prototype);
  }
}

/** Pure predicate: is `event` legal from `from`? */
export function canTransitionTask(from: TaskState, event: TaskEvent): boolean {
  return (TASK_TRANSITIONS[from]?.[event] ?? undefined) !== undefined;
}

/**
 * Apply `event` to a task in state `from`.
 * @throws InvalidTaskTransitionError when the transition is not defined.
 */
export function transitionTask(from: TaskState, event: TaskEvent): TaskState {
  const next = TASK_TRANSITIONS[from]?.[event];
  if (next === undefined) throw new InvalidTaskTransitionError(from, event);
  return next;
}

/* ------------------------------------------------------------------ *
 * Step state (sub-units of a task)
 * ------------------------------------------------------------------ */

export const StepStateSchema = z.enum(['pending', 'running', 'completed', 'failed', 'skipped']);
export type StepState = z.infer<typeof StepStateSchema>;

/* ------------------------------------------------------------------ *
 * Risk, decisions, and policy
 * ------------------------------------------------------------------ */

export const RiskLevelSchema = z.enum(['low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const ApprovalDecisionSchema = z.enum(['approved', 'denied']);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

/**
 * Outcome of evaluating a capability/policy against a proposed action.
 * `require_approval` means the action is permitted only after a human
 * approval decision (see the approval state machine below).
 */
export const PolicyDecisionSchema = z.enum(['allow', 'deny', 'require_approval']);
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

/* ------------------------------------------------------------------ *
 * Approval request state machine
 * ------------------------------------------------------------------ */

export const ApprovalStateSchema = z.enum(['pending', 'approved', 'denied']);
export type ApprovalState = z.infer<typeof ApprovalStateSchema>;

export type ApprovalEvent = 'approve' | 'deny';

export const ApprovalEventSchema = z.enum(['approve', 'deny']);

export const APPROVAL_TRANSITIONS: Readonly<
  Record<ApprovalState, Readonly<Partial<Record<ApprovalEvent, ApprovalState>>>>
> = {
  pending: { approve: 'approved', deny: 'denied' },
  approved: {},
  denied: {},
};

export class InvalidApprovalTransitionError extends Error {
  constructor(
    public readonly from: ApprovalState,
    public readonly event: ApprovalEvent,
  ) {
    super(`Invalid approval transition: ${from} --${event}--> (no such transition)`);
    this.name = 'InvalidApprovalTransitionError';
    Object.setPrototypeOf(this, InvalidApprovalTransitionError.prototype);
  }
}

export function canTransitionApproval(from: ApprovalState, event: ApprovalEvent): boolean {
  return (APPROVAL_TRANSITIONS[from]?.[event] ?? undefined) !== undefined;
}

export function transitionApproval(from: ApprovalState, event: ApprovalEvent): ApprovalState {
  const next = APPROVAL_TRANSITIONS[from]?.[event];
  if (next === undefined) throw new InvalidApprovalTransitionError(from, event);
  return next;
}

/* ------------------------------------------------------------------ *
 * Action receipts & evidence
 * ------------------------------------------------------------------ */

export const ReceiptKindSchema = z.enum([
  'tool_call',
  'file_write',
  'db_write',
  'approval',
  'external_request',
]);
export type ReceiptKind = z.infer<typeof ReceiptKindSchema>;

/** Append-only, content-addressed record of a side effect (E5-S1). */
export const ActionReceiptSchema = z.object({
  id: z.string().uuid(),
  kind: ReceiptKindSchema,
  correlationId: z.string().uuid(),
  projectId: z.string().uuid(),
  actor: z.string().min(1),
  decision: PolicyDecisionSchema,
  payload: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});
export type ActionReceipt = z.infer<typeof ActionReceiptSchema>;

/* ------------------------------------------------------------------ *
 * Boundary parsers — the only sanctioned way to ingest untrusted JSON.
 * Each throws a zod ZodError on malformed input rather than silently
 * coercing. Pair these with the `Schema` validators above.
 * ------------------------------------------------------------------ */

export const parseProject = (input: unknown): Project => ProjectSchema.parse(input);
export const parseTaskState = (input: unknown): TaskState => TaskStateSchema.parse(input);
export const parseApprovalState = (input: unknown): ApprovalState =>
  ApprovalStateSchema.parse(input);
export const parsePolicyDecision = (input: unknown): PolicyDecision =>
  PolicyDecisionSchema.parse(input);
export const parseActionReceipt = (input: unknown): ActionReceipt =>
  ActionReceiptSchema.parse(input);

