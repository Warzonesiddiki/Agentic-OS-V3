import { describe, expect, it } from 'vitest';
import { CapabilityInventory, evaluateCapabilityPolicy } from './capability-policy';

const projectId = '11111111-1111-4111-8111-111111111111';
const otherProjectId = '22222222-2222-4222-8222-222222222222';
const agentId = 'agent-primary';

function inventory(): CapabilityInventory {
  const values = new CapabilityInventory();
  values.register({
    id: 'fs.write', name: 'Write a project file', source: 'native', version: '1.0.0', owner: 'platform',
    inputSchema: { type: 'object' }, risk: 'high',
    scope: { projectIds: [projectId], agentIds: [agentId] }, health: 'healthy', enabled: true,
  });
  return values;
}

describe('governed capability policy', () => {
  it('is default-deny for unknown capabilities and absent grants', () => {
    const values = inventory();
    expect(evaluateCapabilityPolicy(values, { version: '1', rules: [] }, {
      projectId, agentId, capabilityId: 'unknown',
    })).toMatchObject({ decision: 'deny', ruleId: 'default-deny' });
    expect(evaluateCapabilityPolicy(values, { version: '1', rules: [] }, {
      projectId, agentId, capabilityId: 'fs.write',
    })).toMatchObject({ decision: 'deny', ruleId: 'default-deny' });
  });

  it('requires approval for a scoped high-risk capability when policy says so', () => {
    const result = evaluateCapabilityPolicy(inventory(), {
      version: 'policy-2026-07',
      rules: [{ id: 'write-needs-approval', capabilityId: 'fs.write', projectId, agentId, decision: 'require_approval' }],
    }, { projectId, agentId, capabilityId: 'fs.write' });
    expect(result).toEqual({
      decision: 'require_approval', policyVersion: 'policy-2026-07', ruleId: 'write-needs-approval', reason: 'Matched application policy rule.',
    });
  });

  it('does not allow scope escalation or unhealthy capabilities even with an allow rule', () => {
    const values = inventory();
    const policy = { version: '1', rules: [{ id: 'allow-write', capabilityId: 'fs.write', decision: 'allow' }] };
    expect(evaluateCapabilityPolicy(values, policy, { projectId: otherProjectId, agentId, capabilityId: 'fs.write' }))
      .toMatchObject({ decision: 'deny', ruleId: 'default-deny' });
    values.register({
      id: 'fs.write', name: 'Write a project file', source: 'native', version: '1.0.0', owner: 'platform',
      inputSchema: {}, risk: 'high', scope: { projectIds: [projectId], agentIds: [agentId] }, health: 'unavailable', enabled: true,
    });
    expect(evaluateCapabilityPolicy(values, policy, { projectId, agentId, capabilityId: 'fs.write' }))
      .toMatchObject({ decision: 'deny', ruleId: 'default-deny' });
  });

  it('selects the most-specific rule deterministically and rejects malformed candidates', () => {
    const values = inventory();
    const result = evaluateCapabilityPolicy(values, {
      version: '1',
      rules: [
        { id: 'general-deny', capabilityId: 'fs.write', decision: 'deny' },
        { id: 'specific-allow', capabilityId: 'fs.write', projectId, agentId, decision: 'allow' },
      ],
    }, { projectId, agentId, capabilityId: 'fs.write' });
    expect(result).toMatchObject({ decision: 'allow', ruleId: 'specific-allow' });
    expect(() => values.register({ id: 'bad' })).toThrow();
    expect(() => evaluateCapabilityPolicy(values, { version: '', rules: [] }, { projectId, agentId, capabilityId: 'fs.write' })).toThrow();
  });
});
