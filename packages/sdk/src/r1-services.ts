/**
 * R1 application services (BMAD E0-S3).
 *
 * These functions are the command/query boundary used by adapters. They own
 * project scoping and state transitions; callers do not mutate repositories
 * directly.
 */
import {
  transitionApproval,
  transitionTask,
  type ActionReceipt,
  type ApprovalEvent,
  type Evidence,
  type Project,
  type ProjectStatus,
  type Task,
  type TaskEvent,
} from './r1-types.js';
import type { ApprovalRequest, R1Repositories } from './repositories.js';

export type ServiceErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'TASK_NOT_FOUND'
  | 'APPROVAL_NOT_FOUND'
  | 'PROJECT_SCOPE_VIOLATION'
  | 'R1_INTERNAL_ERROR';

export class R1ServiceError extends Error {
  constructor(public readonly code: ServiceErrorCode, message: string) {
    super(message);
    this.name = 'R1ServiceError';
    Object.setPrototypeOf(this, R1ServiceError.prototype);
  }
}

/** Safe, stable API representation; internal exception details are omitted. */
export interface R1ApiError {
  readonly code: ServiceErrorCode;
  readonly message: string;
}

export function toR1ApiError(error: unknown): R1ApiError {
  if (error instanceof R1ServiceError) {
    return { code: error.code, message: error.message };
  }
  return { code: 'R1_INTERNAL_ERROR', message: 'The R1 operation could not be completed.' };
}

export interface R1ServiceOptions {
  readonly now?: () => string;
}

export class R1Service {
  private readonly now: () => string;

  constructor(
    private readonly repositories: R1Repositories,
    options: R1ServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async initializeProject(project: Project): Promise<Project> {
    const existing = project.idempotencyKey
      ? (await this.repositories.projects.list()).find(
          (candidate) => candidate.idempotencyKey === project.idempotencyKey,
        )
      : undefined;
    if (existing) return existing;
    return this.repositories.projects.create(project);
  }

  async getProject(projectId: string): Promise<Project | null> {
    return this.repositories.projects.get(projectId);
  }

  async inspectProject(projectId: string): Promise<{ project: Project; status: ProjectStatus } | null> {
    const project = await this.repositories.projects.get(projectId);
    if (!project) return null;
    return {
      project,
      status: {
        mode: project.mode,
        storageHealthy: true,
        providerHealthy: true,
        embeddingHealthy: true,
        syncState: project.mode === 'local' ? 'disabled' : 'idle',
      },
    };
  }

  async createTask(task: Task): Promise<Task> {
    const project = await this.repositories.projects.get(task.projectId);
    if (!project) return Promise.reject(new R1ServiceError('PROJECT_NOT_FOUND', 'Project not found.'));
    return this.repositories.tasks.create(task);
  }

  async getTask(projectId: string, taskId: string): Promise<Task | null> {
    return this.repositories.tasks.get(projectId, taskId);
  }

  async transitionTask(projectId: string, taskId: string, event: TaskEvent): Promise<Task> {
    const task = await this.repositories.tasks.get(projectId, taskId);
    if (!task) return Promise.reject(new R1ServiceError('TASK_NOT_FOUND', 'Task not found.'));
    const next: Task = { ...task, state: transitionTask(task.state, event), updatedAt: this.now() };
    return this.repositories.tasks.update(next);
  }

  async decideApproval(
    projectId: string,
    approvalId: string,
    event: ApprovalEvent,
  ): Promise<ApprovalRequest> {
    const approval = await this.repositories.approvals.get(projectId, approvalId);
    if (!approval) return Promise.reject(new R1ServiceError('APPROVAL_NOT_FOUND', 'Approval request not found.'));
    const next: ApprovalRequest = {
      ...approval,
      state: transitionApproval(approval.state, event),
      updatedAt: this.now(),
    };
    return this.repositories.approvals.update(next);
  }

  async appendEvidence(projectId: string, evidence: Evidence): Promise<Evidence> {
    if (evidence.projectId !== projectId) {
      return Promise.reject(new R1ServiceError('PROJECT_SCOPE_VIOLATION', 'Resource is outside the project scope.'));
    }
    return this.repositories.evidence.append(evidence);
  }

  async listTaskEvidence(projectId: string, taskId: string): Promise<readonly Evidence[]> {
    return this.repositories.evidence.listForTask(projectId, taskId);
  }

  async appendActionReceipt(projectId: string, receipt: ActionReceipt): Promise<ActionReceipt> {
    if (receipt.projectId !== projectId) {
      return Promise.reject(new R1ServiceError('PROJECT_SCOPE_VIOLATION', 'Resource is outside the project scope.'));
    }
    return this.repositories.receipts.append(receipt);
  }

  async listTaskReceipts(projectId: string, taskId: string): Promise<readonly ActionReceipt[]> {
    return this.repositories.receipts.listForTask(projectId, taskId);
  }
}

