/**
 * Deterministic local repository adapter for R1 contract tests and offline
 * development. It deliberately enforces project scoping and task idempotency
 * so service code cannot accidentally depend on database quirks.
 */
import type {
  ActionReceipt,
  Capability,
  Evidence,
  Project,
  Task,
  TaskRecordEvent,
  TaskStep,
} from './r1-types.js';
import type {
  ApprovalRepository,
  ApprovalRequest,
  CapabilityRepository,
  EvidenceRepository,
  MemoryRecord,
  MemoryRepository,
  ProjectRepository,
  ReceiptRepository,
  R1Repositories,
  TaskRepository,
} from './repositories.js';

export type RepositoryErrorCode =
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'PROJECT_SCOPE_VIOLATION';

export class RepositoryError extends Error {
  constructor(
    public readonly code: RepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RepositoryError';
    Object.setPrototypeOf(this, RepositoryError.prototype);
  }
}

function scoped(projectId: string, expectedProjectId: string): void {
  if (projectId !== expectedProjectId) {
    throw new RepositoryError('PROJECT_SCOPE_VIOLATION', 'Resource is outside the project scope.');
  }
}

class MemoryProjects implements ProjectRepository {
  private readonly values = new Map<string, Project>();
  async get(projectId: string): Promise<Project | null> { return this.values.get(projectId) ?? null; }
  async list(): Promise<readonly Project[]> { return [...this.values.values()]; }
  async create(project: Project): Promise<Project> {
    if (this.values.has(project.id)) throw new RepositoryError('ALREADY_EXISTS', 'Project already exists.');
    this.values.set(project.id, project); return project;
  }
  async update(project: Project): Promise<Project> {
    if (!this.values.has(project.id)) throw new RepositoryError('NOT_FOUND', 'Project not found.');
    this.values.set(project.id, project); return project;
  }
}

class MemoryMemories implements MemoryRepository {
  private readonly values = new Map<string, MemoryRecord>();
  async get(projectId: string, memoryId: string): Promise<MemoryRecord | null> {
    const value = this.values.get(memoryId);
    if (!value) return null;
    scoped(projectId, value.projectId);
    return value;
  }
  async list(projectId: string): Promise<readonly MemoryRecord[]> {
    return [...this.values.values()].filter((value) => value.projectId === projectId);
  }
  async save(memory: MemoryRecord): Promise<MemoryRecord> {
    const existing = this.values.get(memory.id);
    if (existing) scoped(memory.projectId, existing.projectId);
    this.values.set(memory.id, memory); return memory;
  }
  async archive(projectId: string, memoryId: string): Promise<void> {
    const value = this.values.get(memoryId);
    if (!value) throw new RepositoryError('NOT_FOUND', 'Memory not found.');
    scoped(projectId, value.projectId);
    this.values.delete(memoryId);
  }
}

class MemoryTasks implements TaskRepository {
  private readonly values = new Map<string, Task>();
  private readonly events = new Map<string, TaskRecordEvent[]>();
  private readonly steps = new Map<string, TaskStep>();
  async get(projectId: string, taskId: string): Promise<Task | null> {
    const value = this.values.get(taskId);
    if (!value) return null;
    scoped(projectId, value.projectId); return value;
  }
  async list(projectId: string): Promise<readonly Task[]> {
    return [...this.values.values()].filter((value) => value.projectId === projectId);
  }
  async create(task: Task): Promise<Task> {
    const duplicate = [...this.values.values()].find(
      (value) => value.projectId === task.projectId && value.idempotencyKey === task.idempotencyKey,
    );
    if (duplicate) return duplicate;
    if (this.values.has(task.id)) throw new RepositoryError('ALREADY_EXISTS', 'Task already exists.');
    this.values.set(task.id, task);
    this.events.set(task.id, [{
      id: `${task.id}:created`,
      projectId: task.projectId,
      taskId: task.id,
      event: 'created',
      state: task.state,
      sequence: 0,
      createdAt: task.createdAt,
    }]);
    return task;
  }
  async update(task: Task): Promise<Task> {
    const existing = this.values.get(task.id);
    if (!existing) throw new RepositoryError('NOT_FOUND', 'Task not found.');
    scoped(task.projectId, existing.projectId); this.values.set(task.id, task); return task;
  }
  async listEvents(projectId: string, taskId: string): Promise<readonly TaskRecordEvent[]> {
    const task = await this.get(projectId, taskId);
    if (!task) return [];
    return this.events.get(task.id) ?? [];
  }
  async listSteps(projectId: string, taskId: string): Promise<readonly TaskStep[]> {
    const task = await this.get(projectId, taskId);
    if (!task) return [];
    return [...this.steps.values()].filter((step) => step.taskId === task.id);
  }
  async saveStep(step: TaskStep): Promise<TaskStep> {
    const task = this.values.get(step.taskId);
    if (!task) throw new RepositoryError('NOT_FOUND', 'Task not found.');
    this.steps.set(step.id, step); return step;
  }
}

class MemoryApprovals implements ApprovalRepository {
  private readonly values = new Map<string, ApprovalRequest>();
  async get(projectId: string, approvalId: string): Promise<ApprovalRequest | null> {
    const value = this.values.get(approvalId);
    if (!value) return null;
    scoped(projectId, value.projectId); return value;
  }
  async listPending(projectId: string): Promise<readonly ApprovalRequest[]> {
    return [...this.values.values()].filter((value) => value.projectId === projectId && value.state === 'pending');
  }
  async create(request: ApprovalRequest): Promise<ApprovalRequest> {
    if (this.values.has(request.id)) throw new RepositoryError('ALREADY_EXISTS', 'Approval already exists.');
    this.values.set(request.id, request); return request;
  }
  async update(request: ApprovalRequest): Promise<ApprovalRequest> {
    const existing = this.values.get(request.id);
    if (!existing) throw new RepositoryError('NOT_FOUND', 'Approval not found.');
    scoped(request.projectId, existing.projectId); this.values.set(request.id, request); return request;
  }
}

class MemoryEvidence implements EvidenceRepository {
  private readonly values: Evidence[] = [];
  async append(evidence: Evidence): Promise<Evidence> { this.values.push(evidence); return evidence; }
  async listForProject(projectId: string): Promise<readonly Evidence[]> {
    return this.values.filter((value) => value.projectId === projectId);
  }
  async listForTask(projectId: string, taskId: string): Promise<readonly Evidence[]> {
    return this.values.filter((value) => value.projectId === projectId && value.taskId === taskId);
  }
}

class MemoryCapabilities implements CapabilityRepository {
  private readonly values = new Map<string, Capability>();
  async get(capabilityId: string): Promise<Capability | null> { return this.values.get(capabilityId) ?? null; }
  async list(): Promise<readonly Capability[]> { return [...this.values.values()]; }
  async save(capability: Capability): Promise<Capability> { this.values.set(capability.id, capability); return capability; }
}

class MemoryReceipts implements ReceiptRepository {
  private readonly values: ActionReceipt[] = [];
  async append(receipt: ActionReceipt): Promise<ActionReceipt> { this.values.push(receipt); return receipt; }
  async listForTask(projectId: string, taskId: string): Promise<readonly ActionReceipt[]> {
    return this.values.filter((value) => value.projectId === projectId && value.payload.taskId === taskId);
  }
}

export class InMemoryR1Repositories implements R1Repositories {
  readonly projects = new MemoryProjects();
  readonly memories = new MemoryMemories();
  readonly tasks = new MemoryTasks();
  readonly approvals = new MemoryApprovals();
  readonly evidence = new MemoryEvidence();
  readonly capabilities = new MemoryCapabilities();
  readonly receipts = new MemoryReceipts();
}
