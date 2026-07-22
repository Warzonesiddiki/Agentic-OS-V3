/**
 * Schema-versioned, scope-safe project export/import dry run (BMAD E1-S3).
 *
 * Guarantees (acceptance criteria):
 * 1. Export is schema-versioned and scoped to exactly one project.
 * 2. Secret-shaped fields are redacted/omitted per the export policy and every
 *    redaction is reported.
 * 3. Import validates schema and content integrity before any mutation.
 * 4. The dry-run report enumerates additions, conflicts, rejected records and
 *    redactions without touching persistence.
 * 5. Invalid input can never partially mutate the project: apply runs only
 *    when the fresh plan says wouldApply, and callers may wrap it in a real
 *    database transaction (the server composition root does for both SQLite
 *    and PostgreSQL).
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ActionReceiptSchema,
  EvidenceSchema,
  ProjectSchema,
  ProvenanceMemorySchema,
  TaskRecordEventSchema,
  TaskSchema,
  TaskStepSchema,
  type ActionReceipt,
  type Evidence,
  type TaskRecordEvent,
  type TaskStep,
} from './r1-types.js';
import type { MemoryRecord, R1Repositories } from './repositories.js';

export const PROJECT_EXPORT_SCHEMA_VERSION = 'r1.project-export.v1' as const;

export const TransferCollectionSchema = z.enum([
  'project', 'memories', 'evidence', 'tasks', 'taskEvents', 'taskSteps', 'receipts',
]);
export type TransferCollection = z.infer<typeof TransferCollectionSchema>;
export type TransferRecordCollection = Exclude<TransferCollection, 'project'>;

export const RedactionRecordSchema = z.object({
  collection: TransferCollectionSchema,
  recordId: z.string().min(1),
  field: z.string().min(1),
  action: z.enum(['redacted', 'omitted']),
});
export type RedactionRecord = z.infer<typeof RedactionRecordSchema>;

/** Default: any object key that smells like a secret is scrubbed from the exported copy. */
export const DEFAULT_REDACT_KEY_PATTERN =
  'password|passwd|secret|token|api[_-]?key|authorization|credential|private[_-]?key';

export const ExportPolicySchema = z.object({
  /** Case-insensitive source for the field-name redaction RegExp. */
  redactKeyPattern: z.string().min(1).max(500).default(DEFAULT_REDACT_KEY_PATTERN),
  /** When true, receipt payloads are omitted entirely (audit kind/actor/decision survive). */
  omitReceiptPayloads: z.boolean().default(false),
});
export type ExportPolicy = z.infer<typeof ExportPolicySchema>;
export type ExportPolicyInput = z.input<typeof ExportPolicySchema>;

const TransferPayloadSchema = z.object({
  schemaVersion: z.literal(PROJECT_EXPORT_SCHEMA_VERSION),
  exportedAt: z.string().datetime(),
  project: ProjectSchema,
  memories: z.array(ProvenanceMemorySchema).max(100_000),
  evidence: z.array(EvidenceSchema).max(100_000),
  tasks: z.array(TaskSchema).max(100_000),
  taskEvents: z.array(TaskRecordEventSchema).max(1_000_000),
  taskSteps: z.array(TaskStepSchema).max(1_000_000),
  receipts: z.array(ActionReceiptSchema).max(1_000_000),
});
type TransferPayload = z.infer<typeof TransferPayloadSchema>;

export const ProjectExportBundleSchema = TransferPayloadSchema.extend({
  redactions: z.array(RedactionRecordSchema),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
}).superRefine((bundle, ctx) => {
  // A bundle is scoped to exactly one project: every record must belong to
  // bundle.project.id, otherwise the parsed value is invalid (fail closed).
  const scoped: Array<[TransferRecordCollection, readonly { projectId: string }[]]> = [
    ['memories', bundle.memories],
    ['evidence', bundle.evidence],
    ['tasks', bundle.tasks],
    ['taskEvents', bundle.taskEvents],
    ['receipts', bundle.receipts],
  ];
  for (const [collection, records] of scoped) {
    records.forEach((record, index) => {
      if (record.projectId !== bundle.project.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [collection, index, 'projectId'],
          message: 'Record is outside the bundle project scope.',
        });
      }
    });
  }
  const taskIds = new Set(bundle.tasks.map((task) => task.id));
  bundle.taskEvents.forEach((event, index) => {
    if (!taskIds.has(event.taskId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['taskEvents', index, 'taskId'], message: 'Task event has no parent task in the bundle.' });
    }
  });
  bundle.taskSteps.forEach((step, index) => {
    if (!taskIds.has(step.taskId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['taskSteps', index, 'taskId'], message: 'Task step has no parent task in the bundle.' });
    }
  });
});
export type ProjectExportBundle = z.infer<typeof ProjectExportBundleSchema>;

export interface ImportConflict {
  readonly collection: TransferCollection;
  readonly id: string;
  readonly reason: string;
}
export interface ImportRejection {
  readonly collection: TransferCollection;
  readonly id: string;
  readonly reason: string;
}
export interface ImportPlanCounts {
  readonly additions: number;
  readonly conflicts: number;
  readonly unchanged: number;
  readonly rejected: number;
}

export interface ImportDryRunReport {
  readonly schemaVersion: typeof PROJECT_EXPORT_SCHEMA_VERSION;
  readonly projectId: string;
  readonly checkedAt: string;
  readonly wouldApply: boolean;
  readonly additions: Record<TransferRecordCollection, readonly string[]>;
  readonly unchanged: Record<TransferRecordCollection, readonly string[]>;
  readonly conflicts: readonly ImportConflict[];
  readonly rejected: readonly ImportRejection[];
  readonly redactions: readonly RedactionRecord[];
  readonly counts: Record<TransferCollection, ImportPlanCounts>;
  readonly issues?: readonly string[];
}

export interface ImportApplyResult {
  readonly applied: boolean;
  readonly plan: ImportDryRunReport;
}

/** Deterministic JSON with recursively sorted keys; the only shape ever hashed or compared. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
  return `{${entries.join(',')}}`;
}

function sha256Hex(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function scrubObject(
  value: unknown,
  keyPattern: RegExp,
  path: string,
  onRedact: (field: string) => void,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) => scrubObject(entry, keyPattern, `${path}[${index}]`, onRedact));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        const field = path ? `${path}.${key}` : key;
        if (keyPattern.test(key)) {
          onRedact(field);
          return [key, '[REDACTED]'];
        }
        return [key, scrubObject(entry, keyPattern, field, onRedact)];
      }),
    );
  }
  return value;
}

const EMPTY_COUNTS: ImportPlanCounts = { additions: 0, conflicts: 0, unchanged: 0, rejected: 0 };
const emptyIdSets = (): Record<TransferRecordCollection, string[]> => ({
  memories: [], evidence: [], tasks: [], taskEvents: [], taskSteps: [], receipts: [],
});
const emptyCounts = (): Record<TransferCollection, ImportPlanCounts> => ({
  project: { ...EMPTY_COUNTS }, memories: { ...EMPTY_COUNTS }, evidence: { ...EMPTY_COUNTS },
  tasks: { ...EMPTY_COUNTS }, taskEvents: { ...EMPTY_COUNTS }, taskSteps: { ...EMPTY_COUNTS },
  receipts: { ...EMPTY_COUNTS },
});

export interface ProjectTransferOptions {
  readonly now?: () => string;
  readonly digest?: (canonical: string) => string;
}

/** Reconcile bundle records against stored records by primary id. */
function reconcileById<T extends { id: string }>(
  collection: TransferRecordCollection,
  records: readonly T[],
  stored: readonly T[],
  additions: Record<TransferRecordCollection, string[]>,
  unchanged: Record<TransferRecordCollection, string[]>,
  conflicts: ImportConflict[],
): ImportPlanCounts {
  const byId = new Map(stored.map((record) => [record.id, record]));
  let counts = { ...EMPTY_COUNTS };
  for (const record of records) {
    const existing = byId.get(record.id);
    if (!existing) {
      additions[collection].push(record.id);
      counts = { ...counts, additions: counts.additions + 1 };
    } else if (canonicalJson(existing) === canonicalJson(record)) {
      unchanged[collection].push(record.id);
      counts = { ...counts, unchanged: counts.unchanged + 1 };
    } else {
      conflicts.push({ collection, id: record.id, reason: 'stored record diverges from the bundle.' });
      counts = { ...counts, conflicts: counts.conflicts + 1 };
    }
  }
  return counts;
}

export class ProjectTransferService {
  private readonly now: () => string;
  private readonly digest: (canonical: string) => string;

  constructor(
    private readonly repositories: R1Repositories,
    options: ProjectTransferOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.digest = options.digest ?? sha256Hex;
  }

  /**
   * Export one project as a schema-versioned, integrity-hashed, policy-redacted
   * bundle. Returns null when the project does not exist.
   */
  async exportProject(
    projectId: string,
    policyInput: ExportPolicyInput = {},
  ): Promise<ProjectExportBundle | null> {
    const policy = ExportPolicySchema.parse(policyInput);
    const project = await this.repositories.projects.get(projectId);
    if (!project) return null;

    const [memories, tasks, evidence] = await Promise.all([
      this.repositories.memories.list(projectId),
      this.repositories.tasks.list(projectId),
      this.repositories.evidence.listForProject(projectId),
    ]);
    const taskEvents: TaskRecordEvent[] = [];
    const taskSteps: TaskStep[] = [];
    const receipts: ActionReceipt[] = [];
    for (const task of tasks) {
      taskEvents.push(...await this.repositories.tasks.listEvents(projectId, task.id));
      taskSteps.push(...await this.repositories.tasks.listSteps(projectId, task.id));
      receipts.push(...await this.repositories.receipts.listForTask(projectId, task.id));
    }

    const redactions: RedactionRecord[] = [];
    const keyPattern = new RegExp(policy.redactKeyPattern, 'i');
    const scrubField = (
      collection: TransferCollection,
      recordId: string,
      prefix: string,
      value: unknown,
    ): unknown => {
      const fields: string[] = [];
      const scrubbed = scrubObject(value, keyPattern, prefix, (field) => fields.push(field));
      fields.forEach((field) => redactions.push({ collection, recordId, field, action: 'redacted' }));
      return scrubbed;
    };

    // Raw (unparsed) payload: the bundle parse below is the single point that
    // validates every record into the versioned export contract.
    const rawPayload = {
      schemaVersion: PROJECT_EXPORT_SCHEMA_VERSION,
      exportedAt: this.now(),
      project,
      memories: memories.map((memory: MemoryRecord) => ({
        ...memory,
        metadata: scrubField('memories', memory.id, 'metadata', memory.metadata) as MemoryRecord['metadata'],
      })),
      evidence: evidence.map((record: Evidence) => ({
        ...record,
        metadata: scrubField('evidence', record.id, 'metadata', record.metadata) as Evidence['metadata'],
      })),
      tasks: [...tasks],
      taskEvents,
      taskSteps,
      receipts: receipts.map((receipt) => {
        if (policy.omitReceiptPayloads) {
          redactions.push({ collection: 'receipts', recordId: receipt.id, field: 'payload', action: 'omitted' });
          return { ...receipt, payload: {} as Record<string, unknown> };
        }
        return {
          ...receipt,
          payload: scrubField('receipts', receipt.id, 'payload', receipt.payload) as ActionReceipt['payload'],
        };
      }),
    };
    return ProjectExportBundleSchema.parse({
      ...rawPayload,
      redactions,
      contentHash: this.digest(canonicalJson(rawPayload)),
    });
  }

  /**
   * Validate + plan an import with zero persistence mutation. Invalid schema
   * or integrity mismatch produces a rejected report — never a partial write.
   */
  async dryRunImport(candidate: unknown): Promise<ImportDryRunReport> {
    const checkedAt = this.now();
    const parsed = ProjectExportBundleSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        schemaVersion: PROJECT_EXPORT_SCHEMA_VERSION,
        projectId: 'unknown',
        checkedAt,
        wouldApply: false,
        additions: emptyIdSets(),
        unchanged: emptyIdSets(),
        conflicts: [],
        rejected: [{ collection: 'project', id: 'bundle', reason: 'invalid-schema' }],
        redactions: [],
        counts: { ...emptyCounts(), project: { ...EMPTY_COUNTS, rejected: 1 } },
        issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
      };
    }
    const bundle = parsed.data;
    // The hash covers exactly the payload section (redactions + hash excluded).
    const payload = TransferPayloadSchema.parse(bundle);
    if (this.digest(canonicalJson(payload)) !== bundle.contentHash) {
      return {
        schemaVersion: PROJECT_EXPORT_SCHEMA_VERSION,
        projectId: bundle.project.id,
        checkedAt,
        wouldApply: false,
        additions: emptyIdSets(),
        unchanged: emptyIdSets(),
        conflicts: [],
        rejected: [{ collection: 'project', id: bundle.project.id, reason: 'integrity-mismatch' }],
        redactions: bundle.redactions,
        counts: { ...emptyCounts(), project: { ...EMPTY_COUNTS, rejected: 1 } },
      };
    }

    const projectId = bundle.project.id;
    const additions = emptyIdSets();
    const unchanged = emptyIdSets();
    const conflicts: ImportConflict[] = [];
    const rejected: ImportRejection[] = [];

    // Project: same id must be canonically identical; the idempotency key must
    // not belong to a different project (portability guard).
    let projectCounts = { ...EMPTY_COUNTS };
    const existingProject = await this.repositories.projects.get(projectId);
    if (!existingProject) {
      const idemOwner = bundle.project.idempotencyKey
        ? (await this.repositories.projects.list()).find(
            (other) => other.idempotencyKey === bundle.project.idempotencyKey,
          )
        : undefined;
      if (idemOwner) {
        conflicts.push({ collection: 'project', id: projectId, reason: `idempotencyKey already belongs to project ${idemOwner.id}.` });
        projectCounts = { ...projectCounts, conflicts: 1 };
      } else {
        projectCounts = { ...projectCounts, additions: 1 };
      }
    } else if (canonicalJson(existingProject) === canonicalJson(bundle.project)) {
      projectCounts = { ...projectCounts, unchanged: 1 };
    } else {
      conflicts.push({ collection: 'project', id: projectId, reason: 'stored project diverges from the bundle.' });
      projectCounts = { ...projectCounts, conflicts: 1 };
    }

    const [storedMemories, storedTasks, storedEvidence] = await Promise.all([
      this.repositories.memories.list(projectId),
      this.repositories.tasks.list(projectId),
      this.repositories.evidence.listForProject(projectId),
    ]);
    const memoryCounts = reconcileById('memories', bundle.memories, storedMemories, additions, unchanged, conflicts);
    const evidenceCounts = reconcileById('evidence', bundle.evidence, storedEvidence, additions, unchanged, conflicts);
    const taskCounts = reconcileById('tasks', bundle.tasks, storedTasks, additions, unchanged, conflicts);

    // Task idempotency keys are unique per project (durable idempotency contract).
    const storedByIdemKey = new Map(storedTasks.map((task) => [task.idempotencyKey, task]));
    const idemConflicts = bundle.tasks.filter((task) => {
      const owner = storedByIdemKey.get(task.idempotencyKey);
      return owner !== undefined && owner.id !== task.id;
    });
    for (const task of idemConflicts) {
      conflicts.push({
        collection: 'tasks',
        id: task.id,
        reason: `idempotencyKey already belongs to task ${storedByIdemKey.get(task.idempotencyKey)?.id}.`,
      });
    }

    // Task-scoped collections: events keyed by (taskId, sequence); steps and
    // receipts by id (receipts stay reconcilable even when the export policy
    // stripped payload.taskId, because stored linkage comes from the repo).
    let eventCounts = { ...EMPTY_COUNTS };
    let stepCounts = { ...EMPTY_COUNTS };
    let receiptCounts = { ...EMPTY_COUNTS };
    const mergeCounts = (left: ImportPlanCounts, right: ImportPlanCounts): ImportPlanCounts => ({
      additions: left.additions + right.additions,
      conflicts: left.conflicts + right.conflicts,
      unchanged: left.unchanged + right.unchanged,
      rejected: left.rejected + right.rejected,
    });
    const storedReceiptsById = new Map<string, ActionReceipt>();
    for (const task of bundle.tasks) {
      const [storedEvents, storedSteps, storedReceipts] = await Promise.all([
        this.repositories.tasks.listEvents(projectId, task.id),
        this.repositories.tasks.listSteps(projectId, task.id),
        this.repositories.receipts.listForTask(projectId, task.id),
      ]);
      const storedEventKeys = new Map(storedEvents.map((event) => [`${event.taskId}:${event.sequence}`, event] as const));
      for (const event of bundle.taskEvents.filter((record) => record.taskId === task.id)) {
        const existing = storedEventKeys.get(`${event.taskId}:${event.sequence}`);
        if (!existing) {
          additions.taskEvents.push(event.id);
          eventCounts = { ...eventCounts, additions: eventCounts.additions + 1 };
        } else if (canonicalJson(existing) === canonicalJson(event)) {
          unchanged.taskEvents.push(event.id);
          eventCounts = { ...eventCounts, unchanged: eventCounts.unchanged + 1 };
        } else {
          conflicts.push({ collection: 'taskEvents', id: event.id, reason: 'committed event diverges from the bundle.' });
          eventCounts = { ...eventCounts, conflicts: eventCounts.conflicts + 1 };
        }
      }
      stepCounts = mergeCounts(stepCounts, reconcileById(
        'taskSteps', bundle.taskSteps.filter((step) => step.taskId === task.id), storedSteps, additions, unchanged, conflicts,
      ));
      storedReceipts.forEach((receipt) => storedReceiptsById.set(receipt.id, receipt));
    }
    receiptCounts = reconcileById('receipts', bundle.receipts, [...storedReceiptsById.values()], additions, unchanged, conflicts);

    const counts: Record<TransferCollection, ImportPlanCounts> = {
      project: projectCounts,
      memories: memoryCounts,
      evidence: evidenceCounts,
      tasks: { ...taskCounts, conflicts: taskCounts.conflicts + idemConflicts.length },
      taskEvents: eventCounts,
      taskSteps: stepCounts,
      receipts: receiptCounts,
    };
    return {
      schemaVersion: PROJECT_EXPORT_SCHEMA_VERSION,
      projectId,
      checkedAt,
      wouldApply: conflicts.length === 0 && rejected.length === 0,
      additions,
      unchanged,
      conflicts,
      rejected,
      redactions: bundle.redactions,
      counts,
    };
  }

  /**
   * Apply a validated bundle. Refuses (applied=false, zero writes) unless a
   * fresh dry-run says wouldApply. For guaranteed atomicity pass
   * `runInTransaction` — the server composition root supplies a real database
   * transaction for both SQLite and PostgreSQL, so an interrupted import can
   * never partially mutate the project.
   */
  async applyImport(
    candidate: unknown,
    runInTransaction: <T>(fn: () => Promise<T>) => Promise<T> = (fn) => fn(),
  ): Promise<ImportApplyResult> {
    return runInTransaction(async () => {
      const plan = await this.dryRunImport(candidate);
      if (!plan.wouldApply) return { applied: false, plan };
      const bundle = ProjectExportBundleSchema.parse(candidate);
      const added = (collection: TransferRecordCollection, id: string) =>
        plan.additions[collection].includes(id);

      if (plan.counts.project.additions === 1) {
        await this.repositories.projects.create(bundle.project);
      }
      for (const record of bundle.evidence) {
        if (added('evidence', record.id)) await this.repositories.evidence.append(record);
      }
      for (const task of bundle.tasks) {
        if (added('tasks', task.id)) await this.repositories.tasks.create(task);
      }
      for (const event of bundle.taskEvents) {
        if (added('taskEvents', event.id)) await this.repositories.tasks.appendEvent(event);
      }
      for (const step of bundle.taskSteps) {
        if (added('taskSteps', step.id)) await this.repositories.tasks.saveStep(step);
      }
      for (const memory of bundle.memories) {
        if (added('memories', memory.id)) await this.repositories.memories.save(memory);
      }
      for (const receipt of bundle.receipts) {
        if (added('receipts', receipt.id)) await this.repositories.receipts.append(receipt);
      }
      return { applied: true, plan };
    });
  }
}

export type { TransferPayload };
