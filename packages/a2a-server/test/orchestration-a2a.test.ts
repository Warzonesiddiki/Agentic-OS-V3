/**
 * orchestration-a2a.test.ts — unit tests for Phase 13 A2A++ wire-format types.
 * Pure validators only; no kernel/scheduler imports. Aligns with PERSONA_REGISTRY + ADR-0008.
 */
import { describe, it, expect } from 'vitest';
import {
  AgentCapabilitySchema,
  A2AEnvelopeExtSchema,
  DagEventSchema,
  parseAgentCapability,
  parseA2AEnvelopeExt,
  parseDagEvent,
  DOMAINS,
} from '../src/orchestration-a2a.js';

describe('AgentCapability', () => {
  it('accepts a valid read capability (1:1 with PERSONA_REGISTRY)', () => {
    const cap = {
      name: 'memory.search',
      domain: 'Research',
      category: 'read',
      sideEffects: ['env.read', 'memory.read'],
      scopes: ['recall:read'],
      failureMode: 'fail-closed',
    };
    expect(() => AgentCapabilitySchema.parse(cap)).not.toThrow();
    expect(parseAgentCapability(cap).name).toBe('memory.search');
  });

  it('rejects unknown domain', () => {
    expect(() =>
      AgentCapabilitySchema.parse({
        name: 'x',
        domain: 'Nope',
        category: 'read',
        sideEffects: [],
        scopes: [],
        failureMode: 'fail-closed',
      })
    ).toThrow();
  });

  it('rejects unknown extra fields (strict)', () => {
    expect(() =>
      AgentCapabilitySchema.parse({
        name: 'x',
        domain: 'Dev',
        category: 'exec',
        sideEffects: ['process.spawn'],
        scopes: ['*'],
        failureMode: 'fail-open',
        surprise: true,
      })
    ).toThrow();
  });

  it('DOMAINS matches the 10 PERSONA_REGISTRY domains', () => {
    expect(DOMAINS).toHaveLength(10);
    expect(DOMAINS).toContain('Persona' as const);
    expect(DOMAINS).toContain('Meta' as const);
  });
});

describe('A2AEnvelopeExt (A2A++)', () => {
  const base = {
    taskId: 't1',
    traceId: 'trace-1',
    blackboardRefs: [{ key: 'bb:wf1:plan', access: 'read' as const }],
    channel: { role: 'Planner', schemaId: 'planner.in' },
    payload: { foo: 1 },
    sender: 'orchestrator',
    timestamp: new Date().toISOString(),
  };

  it('accepts a valid envelope', () => {
    expect(() => A2AEnvelopeExtSchema.parse(base)).not.toThrow();
    expect(parseA2AEnvelopeExt(base).taskId).toBe('t1');
  });

  it('allows parentTaskId for recursive delegation', () => {
    expect(() => A2AEnvelopeExtSchema.parse({ ...base, parentTaskId: 'parent-1' })).not.toThrow();
  });

  it('rejects a bad blackboard key (must be bb:<wf>:<name>)', () => {
    expect(() =>
      A2AEnvelopeExtSchema.parse({
        ...base,
        blackboardRefs: [{ key: 'plan', access: 'read' }],
      })
    ).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => A2AEnvelopeExtSchema.parse({ taskId: 'x' })).toThrow();
    expect(() => A2AEnvelopeExtSchema.parse({ ...base, traceId: undefined })).toThrow();
  });
});

describe('DagEvent (viz)', () => {
  const ev = {
    workflowId: 'wf1',
    nodeId: 'plan',
    status: 'running' as const,
    ts: new Date().toISOString(),
    agentId: 'agent-7',
    durationMs: 12,
    traceId: 'trace-1',
  };

  it('accepts all statuses', () => {
    for (const s of ['pending', 'running', 'done', 'failed', 'gated', 'handoff']) {
      expect(() => DagEventSchema.parse({ ...ev, status: s })).not.toThrow();
    }
  });

  it('rejects unknown status', () => {
    expect(() => DagEventSchema.parse({ ...ev, status: 'weird' })).toThrow();
  });

  it('optional fields are optional', () => {
    expect(() =>
      parseDagEvent({ workflowId: 'wf1', nodeId: 'n', status: 'done', ts: ev.ts })
    ).not.toThrow();
  });
});
