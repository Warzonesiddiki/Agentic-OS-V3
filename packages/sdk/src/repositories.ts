/**
 * R1 repository contracts (BMAD E0-S3).
 *
 * These interfaces are intentionally persistence-neutral. HTTP routes, UI
 * adapters, and workers depend on these contracts rather than a database
 * client, so local and shared implementations can be substituted and tested
 * against the same behavior.
 */
import type {
  ActionReceipt,
  ApprovalState,
  Capability,
  Evidence,
  Project,
  Task,
  TaskRecordEvent,
  TaskStep,
} from './r1-types.js';

export interface MemoryRecord {
  readonly id: string;
  readonly projectId: string;
  readonly content: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly evidenceIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectRepository {
  get(projectId: string): Promise<Project | null>;
  list(): Promise<readonly Project[]>;
  create(project: Project): Promise<Project>;
  update(project: Project): Promise<Project>;
}

export interface MemoryRepository {
  get(projectId: string, memoryId: string): Promise<MemoryRecord | null>;
  list(projectId: string): Promise<readonly MemoryRecord[]>;
  save(memory: MemoryRecord): Promise<MemoryRecord>;
  archive(projectId: string, memoryId: string): Promise<void>;
}

export interface TaskRepository {
  get(projectId: string, taskId: string): Promise<Task | null>;
  list(projectId: string): Promise<readonly Task[]>;
  /** Implementations must enforce idempotencyKey uniqueness per project. */
  create(task: Task): Promise<Task>;
  update(task: Task): Promise<Task>;
  /** Events are immutable records created with task state commits. */
  listEvents(projectId: string, taskId: string): Promise<readonly TaskRecordEvent[]>;
  listSteps(projectId: string, taskId: string): Promise<readonly TaskStep[]>;
  saveStep(step: TaskStep): Promise<TaskStep>;
}

export interface ApprovalRequest {
  readonly id: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly capabilityId: string;
  readonly state: ApprovalState;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApprovalRepository {
  get(projectId: string, approvalId: string): Promise<ApprovalRequest | null>;
  listPending(projectId: string): Promise<readonly ApprovalRequest[]>;
  create(request: ApprovalRequest): Promise<ApprovalRequest>;
  update(request: ApprovalRequest): Promise<ApprovalRequest>;
}

export interface EvidenceRepository {
  append(evidence: Evidence): Promise<Evidence>;
  listForProject(projectId: string): Promise<readonly Evidence[]>;
  listForTask(projectId: string, taskId: string): Promise<readonly Evidence[]>;
}

export interface CapabilityRepository {
  get(capabilityId: string): Promise<Capability | null>;
  list(): Promise<readonly Capability[]>;
  save(capability: Capability): Promise<Capability>;
}

export interface ReceiptRepository {
  append(receipt: ActionReceipt): Promise<ActionReceipt>;
  listForTask(projectId: string, taskId: string): Promise<readonly ActionReceipt[]>;
}

/** All R1 persistence dependencies required by application services. */
export interface R1Repositories {
  readonly projects: ProjectRepository;
  readonly memories: MemoryRepository;
  readonly tasks: TaskRepository;
  readonly approvals: ApprovalRepository;
  readonly evidence: EvidenceRepository;
  readonly capabilities: CapabilityRepository;
  readonly receipts: ReceiptRepository;
}
