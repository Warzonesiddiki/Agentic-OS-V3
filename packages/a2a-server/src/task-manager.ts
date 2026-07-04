/**
 * task-manager.ts — In-Memory Task Manager and SSE Event Bus for A2A tasks.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { A2ATask, A2ATaskPayload, A2ATaskStatus, A2ATaskStep, A2ATaskEvent } from './types.js';

export type TaskRunner = (
  task: A2ATask,
  onStep: (step: A2ATaskStep) => void,
  onLog: (log: string) => void
) => Promise<unknown>;

export class A2ATaskManager {
  private tasks: Map<string, A2ATask> = new Map();
  private eventEmitter: EventEmitter = new EventEmitter();
  private runner?: TaskRunner;

  constructor() {
    this.eventEmitter.setMaxListeners(100);
  }

  setTaskRunner(runner: TaskRunner): void {
    this.runner = runner;
  }

  createTask(payload: A2ATaskPayload): A2ATask {
    const taskId = payload.taskId || `task_${randomUUID()}`;
    const contextId = payload.contextId || `ctx_${randomUUID()}`;
    const now = Date.now();

    const task: A2ATask = {
      id: taskId,
      contextId,
      status: 'pending',
      goal: payload.goal,
      input: payload.input,
      actor: payload.actor || 'a2a-remote-agent',
      createdAt: now,
      updatedAt: now,
      steps: [],
      logs: [`Task ${taskId} created.`],
    };

    this.tasks.set(taskId, task);
    this.emitEvent(taskId, 'task.started', { taskId, goal: task.goal, status: task.status });

    // Trigger execution asynchronously if runner is set
    if (this.runner) {
      void this.executeTask(taskId);
    }

    return task;
  }

  getTask(taskId: string): A2ATask | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(): A2ATask[] {
    return Array.from(this.tasks.values());
  }

  updateTaskStatus(
    taskId: string,
    status: A2ATaskStatus,
    error?: string,
    result?: unknown
  ): A2ATask | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    task.status = status;
    task.updatedAt = Date.now();
    if (error !== undefined) task.error = error;
    if (result !== undefined) task.result = result;

    if (status === 'completed') {
      this.emitEvent(taskId, 'task.completed', { taskId, result: task.result });
    } else if (status === 'failed') {
      this.emitEvent(taskId, 'task.failed', { taskId, error: task.error });
    }

    return task;
  }

  addStep(taskId: string, step: A2ATaskStep): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.steps.push(step);
    task.updatedAt = Date.now();
    this.emitEvent(taskId, 'task.step', { taskId, step });
  }

  addLog(taskId: string, logMessage: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.logs.push(logMessage);
    task.updatedAt = Date.now();
    this.emitEvent(taskId, 'task.log', { taskId, log: logMessage });
  }

  subscribe(taskId: string, listener: (event: A2ATaskEvent) => void): () => void {
    const eventName = `task:${taskId}`;
    this.eventEmitter.on(eventName, listener);
    return () => {
      this.eventEmitter.off(eventName, listener);
    };
  }

  private emitEvent(taskId: string, type: A2ATaskEvent['type'], data: unknown): void {
    const event: A2ATaskEvent = {
      type,
      taskId,
      timestamp: Date.now(),
      data,
    };
    this.eventEmitter.emit(`task:${taskId}`, event);
  }

  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || !this.runner) return;

    this.updateTaskStatus(taskId, 'running');
    this.addLog(taskId, `Task ${taskId} execution started.`);

    try {
      const result = await this.runner(
        task,
        (step) => this.addStep(taskId, step),
        (logMsg) => this.addLog(taskId, logMsg)
      );

      this.updateTaskStatus(taskId, 'completed', undefined, result);
      this.addLog(taskId, `Task ${taskId} completed successfully.`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.updateTaskStatus(taskId, 'failed', errorMsg);
      this.addLog(taskId, `Task ${taskId} failed: ${errorMsg}`);
    }
  }
}
