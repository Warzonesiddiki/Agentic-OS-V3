import { describe, expect, it } from 'vitest';
import { InMemoryR1Repositories } from './in-memory-repositories.js';
import { BoundedToolGateway } from './r1-tool-gateway.js';
import type { Project, Task } from './r1-types.js';

const project: Project = {
  id: '11111111-1111-4111-8111-111111111111', name: 'gateway', mode: 'local', scope: {},
  createdAt: '2026-07-24T00:00:00.000Z', updatedAt: '2026-07-24T00:00:00.000Z',
};
const task: Task = {
  id: '22222222-2222-4222-8222-222222222222', projectId: project.id, state: 'running', title: 'write',
  principalId: 'principal', agentId: 'agent', goal: 'goal', capabilityIds: [], policyVersion: 'v1', inputReference: 'input',
  correlationId: '33333333-3333-4333-8333-333333333333', idempotencyKey: 'task-1',
  createdAt: project.createdAt, updatedAt: project.updatedAt,
};

describe('BoundedToolGateway effect idempotency', () => {
  it('does not repeat an approved file write with the same task correlation', async () => {
    const repositories = new InMemoryR1Repositories();
    await repositories.projects.create(project);
    await repositories.tasks.create(task);
    let writes = 0;
    const gateway = new BoundedToolGateway(repositories, {
      projectRoots: new Map([[project.id, '/tmp/projects/gateway']]),
      isApprovalApproved: async () => true,
      fileWriter: async () => { writes += 1; },
    });
    const correlationId = '44444444-4444-4444-8444-444444444444';
    const input = {
      projectId: project.id, taskId: task.id, path: 'result.txt', content: 'governed',
      approvalId: '55555555-5555-4555-8555-555555555555', correlationId,
    };

    const first = await gateway.writeFile(input);
    const second = await gateway.writeFile(input);

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: true, receiptId: first.receiptId });
    expect(writes).toBe(1);
  });

  it('atomically claims a command before execution so a concurrent retry cannot repeat it', async () => {
    const repositories = new InMemoryR1Repositories();
    await repositories.projects.create(project);
    await repositories.tasks.create(task);
    let executions = 0;
    const gateway = new BoundedToolGateway(repositories, {
      projectRoots: new Map([[project.id, '/tmp/projects/gateway']]),
      isApprovalApproved: async () => true,
      sandboxExecutor: async () => {
        executions += 1;
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
        return { stdout: 'ok', stderr: '', exitCode: 0 };
      },
    });
    const input = {
      projectId: project.id, taskId: task.id, command: 'echo', args: ['ok'],
      approvalId: '66666666-6666-4666-8666-666666666666', correlationId: '77777777-7777-4777-8777-777777777777',
    };

    const [first, second] = await Promise.all([gateway.runConstrainedCommand(input), gateway.runConstrainedCommand(input)]);

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect(executions).toBe(1);
  });

  it('does not re-run an approved command with the same task correlation', async () => {
    const repositories = new InMemoryR1Repositories();
    await repositories.projects.create(project);
    await repositories.tasks.create(task);
    let executions = 0;
    const gateway = new BoundedToolGateway(repositories, {
      projectRoots: new Map([[project.id, '/tmp/projects/gateway']]),
      isApprovalApproved: async () => true,
      sandboxExecutor: async () => {
        executions += 1;
        return { stdout: 'ok', stderr: '', exitCode: 0 };
      },
    });
    const correlationId = '66666666-6666-4666-8666-666666666666';
    const input = {
      projectId: project.id, taskId: task.id, command: 'echo', args: ['ok'],
      approvalId: '77777777-7777-4777-8777-777777777777', correlationId,
    };

    await gateway.runConstrainedCommand(input);
    const replay = await gateway.runConstrainedCommand(input);

    expect(replay.ok).toBe(true);
    expect(executions).toBe(1);
  });
});
