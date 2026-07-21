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
  ActionReceiptSchema,
  transitionTask,
  canTransitionTask,
  transitionApproval,
  canTransitionApproval,
  InvalidTaskTransitionError,
  InvalidApprovalTransitionError,
  parseProject,
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
      correlationId: '33333333-3333-4333-8333-333333333333',
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
});
