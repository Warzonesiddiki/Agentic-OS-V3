import { describe, it, expect } from 'vitest';
import {
  R1_DOMAIN_VERSION,
  TASK_TRANSITIONS,
  APPROVAL_TRANSITIONS,
  TaskStateSchema,
  TaskEventSchema,
  ApprovalStateSchema,
  ApprovalEventSchema,
  ProjectSchema,
  CapabilitySchema,
  TaskSchema,
  EvidenceSchema,
  ActionReceiptSchema,
  transitionTask,
  canTransitionTask,
  transitionApproval,
  canTransitionApproval,
  InvalidTaskTransitionError,
  InvalidApprovalTransitionError,
  parseProject,
  parseCapability,
  parseTask,
  parseEvidence,
  parseTaskState,
  parseApprovalState,
  parsePolicyDecision,
  parseActionReceipt,
} from './r1-types';

const TASK_STATES = TaskStateSchema.options;
const TASK_EVENTS = TaskEventSchema.options;
const APPROVAL_STATES = ApprovalStateSchema.options;
const APPROVAL_EVENTS = ApprovalEventSchema.options;

describe('R1 domain version', () => {
  it('is a semver-ish string', () => {
    expect(R1_DOMAIN_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('task transitions — every valid edge', () => {
  for (const from of TASK_STATES) {
    const edges = TASK_TRANSITIONS[from];
    for (const event of Object.keys(edges) as (keyof typeof edges)[]) {
      it(`${from} --${event}--> ${edges[event]}`, () => {
        expect(transitionTask(from, event)).toBe(edges[event]);
        expect(canTransitionTask(from, event)).toBe(true);
      });
    }
  }
});

describe('task transitions — invalid edges throw', () => {
  for (const from of TASK_STATES) {
    const valid = Object.keys(TASK_TRANSITIONS[from]);
    for (const event of TASK_EVENTS) {
      if (valid.includes(event)) continue;
      it(`${from} --${event}--> throws`, () => {
        expect(canTransitionTask(from, event)).toBe(false);
        expect(() => transitionTask(from, event as never)).toThrow(InvalidTaskTransitionError);
      });
    }
  }
});

describe('task terminal states accept no events', () => {
  for (const terminal of ['completed', 'failed', 'cancelled'] as const) {
    it(`${terminal} cannot transition`, () => {
      for (const event of TASK_EVENTS) {
        expect(canTransitionTask(terminal, event)).toBe(false);
      }
    });
  }
});

describe('approval transitions', () => {
  for (const from of APPROVAL_STATES) {
    const edges = APPROVAL_TRANSITIONS[from];
    for (const event of Object.keys(edges) as (keyof typeof edges)[]) {
      it(`${from} --${event}--> ${edges[event]}`, () => {
        expect(transitionApproval(from, event)).toBe(edges[event]);
        expect(canTransitionApproval(from, event)).toBe(true);
      });
    }
    for (const event of APPROVAL_EVENTS) {
      if (Object.keys(edges).includes(event)) continue;
      it(`${from} --${event}--> throws`, () => {
        expect(() => transitionApproval(from, event as never)).toThrow(
          InvalidApprovalTransitionError,
        );
      });
    }
  }
});

describe('boundary parsers reject untrusted JSON', () => {
  it('parseProject validates shape', () => {
    const ok = parseProject({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'demo',
      mode: 'local',
      scope: { root: '/tmp' },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
    expect(ok.mode).toBe('local');

    expect(() => parseProject({ id: 'not-a-uuid', name: 'x', mode: 'local', scope: {} })).toThrow();
  });

  it('parseTaskState only accepts known states', () => {
    expect(parseTaskState('queued')).toBe('queued');
    expect(() => parseTaskState('frobnicated')).toThrow();
    expect(() => parseTaskState(42)).toThrow();
  });

  it('parseApprovalState rejects unknown', () => {
    expect(parseApprovalState('pending')).toBe('pending');
    expect(() => parseApprovalState('maybe')).toThrow();
  });

  it('parsePolicyDecision accepts allow/deny/require_approval', () => {
    expect(parsePolicyDecision('require_approval')).toBe('require_approval');
    expect(() => parsePolicyDecision('whatever')).toThrow();
  });

  it('parseActionReceipt validates nested policy decision', () => {
    const receipt = parseActionReceipt({
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'tool_call',
      principalId: 'principal-test', agentId: 'agent-test', goal: 'durable test goal', capabilityIds: [], policyVersion: 'r1', inputReference: 'input:test', correlationId: '33333333-3333-4333-8333-333333333333',
      projectId: '44444444-4444-4444-8444-444444444444',
      actor: 'agent-1',
      decision: 'allow',
      payload: { x: 1 },
      createdAt: new Date(0).toISOString(),
    });
    expect(receipt.kind).toBe('tool_call');
    expect(() => parseActionReceipt({ ...receipt, decision: 'nope' })).toThrow();
  });

  it('ProjectSchema is the source of truth for Project type', () => {
    expect(ProjectSchema.safeParse({ mode: 'shared' }).success).toBe(false);
    expect(ActionReceiptSchema.safeParse({ kind: 'db_write' }).success).toBe(false);
  });

  it('validates capability, task, and evidence contracts', () => {
    const ids = {
      project: '44444444-4444-4444-8444-444444444444',
      task: '55555555-5555-4555-8555-555555555555',
      correlation: '66666666-6666-4666-8666-666666666666',
    };
    const timestamp = new Date(0).toISOString();
    expect(CapabilitySchema.parse({
      id: 'fs.read', name: 'Read files', source: 'native', version: '1.0.0',
      owner: 'runtime', scope: { projectId: ids.project }, risk: 'low', enabled: true,
    }).id).toBe('fs.read');
    expect(parseCapability({
      id: 'fs.read', name: 'Read files', source: 'native', version: '1.0.0',
      owner: 'runtime', scope: { projectId: ids.project }, risk: 'low', enabled: true,
    }).risk).toBe('low');
    expect(TaskSchema.parse({
      id: ids.task, projectId: ids.project, state: 'queued', title: 'Inspect',
      principalId: 'principal-test', agentId: 'agent-test', goal: 'durable test goal', capabilityIds: [], policyVersion: 'r1', inputReference: 'input:test', correlationId: ids.correlation, idempotencyKey: 'request-1',
      createdAt: timestamp, updatedAt: timestamp,
    }).state).toBe('queued');
    expect(() => parseTask({})).toThrow();
    expect(EvidenceSchema.safeParse({
      id: '77777777-7777-4777-8777-777777777777', projectId: ids.project,
      taskId: ids.task, kind: 'trace', source: 'worker', contentHash: 'not-a-hash',
      metadata: {}, createdAt: timestamp,
    }).success).toBe(false);
    expect(parseEvidence({
      id: '77777777-7777-4777-8777-777777777777', projectId: ids.project,
      kind: 'trace', source: 'worker', contentHash: 'a'.repeat(64), metadata: {}, createdAt: timestamp,
    }).kind).toBe('trace');
  });
});
