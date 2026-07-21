import { describe, expect, it } from 'vitest';
import { InMemoryCapabilityGovernanceStore } from '@agentic-os/sdk';
import { CapabilityGovernanceService } from '../src/services/capability-governance.js';

const projectId = '11111111-1111-4111-8111-111111111111';

describe('persisted capability governance service', () => {
  it('evaluates only the persisted inventory and active policy', async () => {
    const service = new CapabilityGovernanceService(new InMemoryCapabilityGovernanceStore());
    await service.register({ id: 'file.write', name: 'Write', source: 'native', version: '1', owner: 'ops', inputSchema: {}, risk: 'high', scope: { projectIds: [projectId], agentIds: ['agent'] }, health: 'healthy', enabled: true });
    await expect(service.evaluate({ projectId, agentId: 'agent', capabilityId: 'file.write' }))
      .resolves.toMatchObject({ decision: 'deny', policyVersion: 'none' });
    await service.setActivePolicy({ version: 'policy-1', rules: [{ id: 'approval', capabilityId: 'file.write', decision: 'require_approval' }] });
    await expect(service.evaluate({ projectId, agentId: 'agent', capabilityId: 'file.write' }))
      .resolves.toMatchObject({ decision: 'require_approval', ruleId: 'approval', policyVersion: 'policy-1' });
  });
});
