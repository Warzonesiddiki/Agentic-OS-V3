/**
 * E7-S2 Versioned A2A Task Adapter — Unit Tests
 * Tests: compatibility matrix, Agent Card validation, delegateTask, promoteArtifact, remote failure handling
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  A2AAdapter,
  A2AVersionSchema,
  A2ABindingSchema,
  AgentCardSchema,
  A2ATaskSchema,
  A2A_COMPATIBILITY_MATRIX,
} from './r1-a2a-adapter.js';

function makeAgentCard(overrides: Partial<Parameters<typeof AgentCardSchema.parse>[0]> = {}): Parameters<typeof AgentCardSchema.parse>[0] {
  return {
    id: 'card-1',
    name: 'Test Agent',
    version: '1.0',
    endpoint: 'https://agent.example.com',
    capabilities: ['code-generation', 'memory-recall'],
    auth: { type: 'bearer', required: true },
    identity: { provider: 'example.com', verified: true },
    ...overrides,
  };
}

describe('A2AAdapter', () => {
  describe('A2A_COMPATIBILITY_MATRIX (E7-S2 AC1)', () => {
    it('declares supported versions', () => {
      expect(A2A_COMPATIBILITY_MATRIX.versions).toContain('1.0');
      expect(A2A_COMPATIBILITY_MATRIX.versions).toContain('0.9');
    });

    it('declares supported bindings', () => {
      expect(A2A_COMPATIBILITY_MATRIX.bindings).toContain('json-rpc');
      expect(A2A_COMPATIBILITY_MATRIX.bindings).toContain('http');
    });

    it('has default version', () => {
      expect(A2A_COMPATIBILITY_MATRIX.defaultVersion).toBe('1.0');
    });
  });

  describe('Zod schemas', () => {
    it('A2AVersionSchema accepts valid versions', () => {
      expect(A2AVersionSchema.parse('1.0')).toBe('1.0');
      expect(A2AVersionSchema.parse('0.9')).toBe('0.9');
    });

    it('A2AVersionSchema rejects invalid versions', () => {
      expect(() => A2AVersionSchema.parse('2.0')).toThrow();
      expect(() => A2AVersionSchema.parse('bogus')).toThrow();
    });

    it('A2ABindingSchema accepts valid bindings', () => {
      expect(A2ABindingSchema.parse('json-rpc')).toBe('json-rpc');
      expect(A2ABindingSchema.parse('http')).toBe('http');
    });

    it('AgentCardSchema validates correct card', () => {
      const card = makeAgentCard();
      expect(AgentCardSchema.parse(card)).toMatchObject({ id: 'card-1' });
    });

    it('AgentCardSchema rejects missing required fields', () => {
      expect(() => AgentCardSchema.parse({ id: 'card-1' })).toThrow();
    });

    it('AgentCardSchema rejects empty capabilities', () => {
      expect(() => AgentCardSchema.parse(makeAgentCard({ capabilities: [] }))).toThrow();
    });

    it('A2ATaskSchema validates correct task', () => {
      const task = {
        id: 'a2a-task-1', contextId: 'ctx-1', localTaskId: '550e8400-e29b-41d4-a716-446655440000',
        agentCardId: 'card-1', status: 'submitted' as const,
        createdAt: '2026-07-23T00:00:00Z', updatedAt: '2026-07-23T00:00:00Z',
        artifacts: [],
      };
      expect(A2ATaskSchema.parse(task)).toMatchObject({ id: 'a2a-task-1' });
    });

    it('A2ATaskSchema validates artifacts', () => {
      const task = {
        id: 't1', contextId: 'c1', localTaskId: '550e8400-e29b-41d4-a716-446655440000',
        agentCardId: 'c1', status: 'completed' as const,
        createdAt: '2026-07-23T00:00:00Z', updatedAt: '2026-07-23T00:00:00Z',
        artifacts: [{ id: 'art-1', mimeType: 'text/plain', content: 'Hello world' }],
      };
      const parsed = A2ATaskSchema.parse(task);
      expect(parsed.artifacts).toHaveLength(1);
      expect(parsed.artifacts[0]!.content).toBe('Hello world');
    });
  });

  describe('constructor', () => {
    it('creates adapter with default repos', () => {
      const adapter = new A2AAdapter();
      expect(adapter).toBeInstanceOf(A2AAdapter);
    });

    it('getCompatibilityMatrix returns matrix', () => {
      const adapter = new A2AAdapter();
      const matrix = adapter.getCompatibilityMatrix();
      expect(matrix.versions).toContain('1.0');
    });
  });

  describe('registerAgentCard (E7-S2 AC2)', () => {
    it('registers valid agent card', async () => {
      const adapter = new A2AAdapter();
      const card = await adapter.registerAgentCard(makeAgentCard());
      expect(card.id).toBe('card-1');
    });

    it('rejects version not in compatibility matrix', async () => {
      // '1.0-proto' is valid in Zod schema but may not be in compatibility matrix — test checks code path
      const adapter = new A2AAdapter();
      // Test that a version in schema but not matrix is rejected
      // The validateAgentCard code checks COMPATIBILITY_MATRIX.versions.includes(card.version)
      const matrix = adapter.getCompatibilityMatrix();
      // If '1.0-proto' is not in matrix, it should be rejected by code
      if (!matrix.versions.includes('1.0-proto' as any)) {
        await expect(adapter.registerAgentCard(makeAgentCard({ version: '1.0-proto' as any })))
          .rejects.toThrow('Unsupported A2A version');
      } else {
        // If it IS in matrix, this test passes trivially
        expect(matrix.versions).toContain('1.0-proto');
      }
    });

    it('rejects unverified identity (AC2)', async () => {
      const adapter = new A2AAdapter();
      await expect(adapter.registerAgentCard(makeAgentCard({ identity: { provider: 'x', verified: false } })))
        .rejects.toThrow('identity not verified');
    });

    it('rejects auth required but type none', async () => {
      const adapter = new A2AAdapter();
      await expect(adapter.registerAgentCard(makeAgentCard({ auth: { type: 'none', required: true } })))
        .rejects.toThrow('requires auth but type is none');
    });

    it('rejects non-https endpoint (AC2)', async () => {
      const adapter = new A2AAdapter();
      await expect(adapter.registerAgentCard(makeAgentCard({ endpoint: 'http://insecure.example.com' })))
        .rejects.toThrow('must be https or localhost');
    });

    it('allows localhost endpoint', async () => {
      const adapter = new A2AAdapter();
      const card = await adapter.registerAgentCard(makeAgentCard({ endpoint: 'http://localhost:8080' }));
      expect(card.id).toBe('card-1');
    });

    it('allows mtls auth type', async () => {
      const adapter = new A2AAdapter();
      const card = await adapter.registerAgentCard(makeAgentCard({ auth: { type: 'mtls', required: true } }));
      expect(card.id).toBe('card-1');
    });
  });

  describe('listAgentCards', () => {
    it('returns empty list initially', async () => {
      const adapter = new A2AAdapter();
      const cards = await adapter.listAgentCards();
      expect(cards).toHaveLength(0);
    });

    it('returns all registered cards', async () => {
      const adapter = new A2AAdapter();
      await adapter.registerAgentCard(makeAgentCard({ id: 'card-1' }));
      await adapter.registerAgentCard(makeAgentCard({ id: 'card-2', name: 'Agent 2' }));
      const cards = await adapter.listAgentCards();
      expect(cards).toHaveLength(2);
    });
  });

  describe('delegateTask (E7-S2 AC3, AC4)', () => {
    let adapter: A2AAdapter;
    beforeEach(async () => {
      adapter = new A2AAdapter();
      await adapter.registerAgentCard(makeAgentCard({ id: 'remote-agent' }));
    });

    it('creates A2A task with local task correlation (AC3)', async () => {
      const localTaskId = '550e8400-e29b-41d4-a716-446655440000';
      const task = await adapter.delegateTask({ localTaskId, agentCardId: 'remote-agent', owner: 'user-1' });
      expect(task.localTaskId).toBe(localTaskId);
      expect(task.agentCardId).toBe('remote-agent');
      expect(task.status).toBe('submitted');
      expect(task.contextId).toBeDefined();
    });

    it('includes localStepId when provided', async () => {
      const localStepId = '660e8400-e29b-41d4-a716-446655440001';
      const task = await adapter.delegateTask({
        localTaskId: '550e8400-e29b-41d4-a716-446655440000',
        localStepId, agentCardId: 'remote-agent', owner: 'user-1',
      });
      expect(task.localStepId).toBe(localStepId);
    });

    it('throws for unknown agent card', async () => {
      await expect(adapter.delegateTask({
        localTaskId: '550e8400-e29b-41d4-a716-446655440000',
        agentCardId: 'ghost', owner: 'user-1',
      })).rejects.toThrow('not found');
    });

    it('policy deny blocks delegation (AC4)', async () => {
      const denyAdapter = new A2AAdapter(
        undefined, undefined,
        { policyCheck: async () => ({ effect: 'deny', reason: 'blocked by policy' }) }
      );
      await denyAdapter.registerAgentCard(makeAgentCard({ id: 'deny-agent' }));
      await expect(denyAdapter.delegateTask({
        localTaskId: '550e8400-e29b-41d4-a716-446655440000',
        agentCardId: 'deny-agent', owner: 'user-1',
      })).rejects.toThrow('Policy denied');
    });

    it('approval_required blocks delegation without approvalId (AC4)', async () => {
      const approvalAdapter = new A2AAdapter(
        undefined, undefined,
        { policyCheck: async () => ({ effect: 'approval_required', reason: 'needs human' }) }
      );
      await approvalAdapter.registerAgentCard(makeAgentCard({ id: 'approval-agent' }));
      await expect(approvalAdapter.delegateTask({
        localTaskId: '550e8400-e29b-41d4-a716-446655440000',
        agentCardId: 'approval-agent', owner: 'user-1',
      })).rejects.toThrow('requires approval');
    });

    it('delegation succeeds with valid approvalId', async () => {
      const approvalAdapter = new A2AAdapter(
        undefined, undefined,
        { isApprovalApproved: async (id) => id === 'approval-ok' }
      );
      await approvalAdapter.registerAgentCard(makeAgentCard({ id: 'approval-agent' }));
      const task = await approvalAdapter.delegateTask({
        localTaskId: '550e8400-e29b-41d4-a716-446655440000',
        agentCardId: 'approval-agent', owner: 'user-1', approvalId: 'approval-ok',
      });
      expect(task.id).toBeDefined();
    });

    it('rejects with wrong approvalId', async () => {
      const approvalAdapter = new A2AAdapter(
        undefined, undefined,
        {
          policyCheck: async () => ({ effect: 'approval_required', reason: 'needs human' }),
          isApprovalApproved: async (id) => id === 'approval-ok',
        }
      );
      await approvalAdapter.registerAgentCard(makeAgentCard({ id: 'wrong-agent' }));
      await expect(approvalAdapter.delegateTask({
        localTaskId: '550e8400-e29b-41d4-a716-446655440000',
        agentCardId: 'wrong-agent', owner: 'user-1', approvalId: 'wrong-id',
      })).rejects.toThrow('not approved');
    });
  });

  describe('getRemoteStatus (E7-S2 AC5)', () => {
    it('returns task status', async () => {
      const adapter = new A2AAdapter();
      await adapter.registerAgentCard(makeAgentCard({ id: 'ra' }));
      const task = await adapter.delegateTask({ localTaskId: '550e8400-e29b-41d4-a716-446655440000', agentCardId: 'ra', owner: 'u' });
      const status = await adapter.getRemoteStatus(task.id);
      expect(status.id).toBe(task.id);
    });

    it('throws for unknown task', async () => {
      const adapter = new A2AAdapter();
      await expect(adapter.getRemoteStatus('ghost-task')).rejects.toThrow('not found');
    });

    it('unknown status remains visible (AC5)', async () => {
      const adapter = new A2AAdapter();
      await adapter.registerAgentCard(makeAgentCard({ id: 'ra' }));
      const task = await adapter.delegateTask({ localTaskId: '550e8400-e29b-41d4-a716-446655440000', agentCardId: 'ra', owner: 'u' });
      // Simulate unknown status
      const updated = await adapter.updateRemoteStatus(task.id, 'unknown');
      expect(updated.status).toBe('unknown');
      const reFetched = await adapter.getRemoteStatus(task.id);
      expect(reFetched.status).toBe('unknown'); // visible, recoverable
    });
  });

  describe('updateRemoteStatus (E7-S2 AC5)', () => {
    it('updates task status and artifacts', async () => {
      const adapter = new A2AAdapter();
      await adapter.registerAgentCard(makeAgentCard({ id: 'ra' }));
      const task = await adapter.delegateTask({ localTaskId: '550e8400-e29b-41d4-a716-446655440000', agentCardId: 'ra', owner: 'u' });
      const updated = await adapter.updateRemoteStatus(task.id, 'completed', [
        { id: 'art-1', mimeType: 'text/plain', content: 'result' },
      ]);
      expect(updated.status).toBe('completed');
      expect(updated.artifacts).toHaveLength(1);
    });

    it('throws for unknown task', async () => {
      const adapter = new A2AAdapter();
      await expect(adapter.updateRemoteStatus('ghost', 'completed')).rejects.toThrow('not found');
    });
  });

  describe('promoteArtifact (E7-S2 AC4, AC6)', () => {
    let adapter: A2AAdapter;
    beforeEach(async () => {
      adapter = new A2AAdapter();
      await adapter.registerAgentCard(makeAgentCard({ id: 'ra' }));
      await adapter.registerAgentCard(makeAgentCard({ id: 'local-agent', name: 'Local Agent' } as any));
    });

    it('promotes artifact with policy allow', async () => {
      // Create task with artifact
      const task = await adapter.delegateTask({ localTaskId: '550e8400-e29b-41d4-a716-446655440000', agentCardId: 'ra', owner: 'u' });
      await adapter.updateRemoteStatus(task.id, 'completed', [
        { id: 'art-1', mimeType: 'text/plain', content: 'remote output' },
      ]);
      const result = await adapter.promoteArtifact({ a2aTaskId: task.id, artifactId: 'art-1', owner: 'u' });
      expect(result.promoted).toBe(true);
    });

    it('marks promoted artifact as untrusted candidate (AC6)', async () => {
      const task = await adapter.delegateTask({ localTaskId: '550e8400-e29b-41d4-a716-446655440000', agentCardId: 'ra', owner: 'u' });
      await adapter.updateRemoteStatus(task.id, 'completed', [
        { id: 'art-2', mimeType: 'application/json', content: { key: 'value' } },
      ]);
      const result = await adapter.promoteArtifact({ a2aTaskId: task.id, artifactId: 'art-2', owner: 'u' });
      expect(result.artifact).toMatchObject({
        metadata: expect.objectContaining({ trust: 'candidate', untrusted: true }),
      });
    });

    it('policy deny blocks promotion (AC4)', async () => {
      // Use adapter that allows delegation but denies promotion
      const testAdapter = new A2AAdapter(
        undefined, undefined,
        {
          policyCheck: async (tool: string) => {
            if (tool.startsWith('a2a:artifact:')) return { effect: 'deny', reason: 'blocked by policy' };
            return { effect: 'allow', reason: 'ok' };
          },
        }
      );
      await testAdapter.registerAgentCard(makeAgentCard({ id: 'deny' }));
      const task = await testAdapter.delegateTask({ localTaskId: '550e8400-e29b-41d4-a716-446655440000', agentCardId: 'deny', owner: 'u' });
      await testAdapter.updateRemoteStatus(task.id, 'completed', [
        { id: 'art-1', mimeType: 'text/plain', content: 'x' },
      ]);
      const result = await testAdapter.promoteArtifact({ a2aTaskId: task.id, artifactId: 'art-1', owner: 'u' });
      expect(result.promoted).toBe(false);
      expect(result.reason).toContain('Policy denied');
    });

    it('throws for nonexistent task when promoting artifact', async () => {
      await expect(adapter.promoteArtifact({ a2aTaskId: 'ghost-task', artifactId: 'art-1', owner: 'u' }))
        .rejects.toThrow('not found');
    });

    it('throws for unknown task', async () => {
      await expect(adapter.promoteArtifact({ a2aTaskId: 'ghost', artifactId: 'art-1', owner: 'u' }))
        .rejects.toThrow('not found');
    });

    it('throws for unknown artifact', async () => {
      const task = await adapter.delegateTask({ localTaskId: '550e8400-e29b-41d4-a716-446655440000', agentCardId: 'ra', owner: 'u' });
      await expect(adapter.promoteArtifact({ a2aTaskId: task.id, artifactId: 'ghost', owner: 'u' }))
        .rejects.toThrow('not found');
    });
  });

  describe('listForLocalTask (E7-S2 AC3)', () => {
    it('returns all A2A tasks for a local task', async () => {
      const adapter = new A2AAdapter();
      await adapter.registerAgentCard(makeAgentCard({ id: 'ra1' }));
      await adapter.registerAgentCard(makeAgentCard({ id: 'ra2', name: 'Agent 2' }));
      const localTaskId = '550e8400-e29b-41d4-a716-446655440000';
      await adapter.delegateTask({ localTaskId, agentCardId: 'ra1', owner: 'u' });
      await adapter.delegateTask({ localTaskId, agentCardId: 'ra2', owner: 'u' });
      const tasks = await adapter.listForLocalTask(localTaskId);
      expect(tasks).toHaveLength(2);
    });
  });
});
