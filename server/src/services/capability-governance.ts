import {
  CapabilityInventory,
  evaluateCapabilityPolicy,
  type CapabilityGovernanceStore,
  type CapabilityPolicy,
  type CapabilityRequest,
  type GovernedCapability,
  type PolicyEvaluation,
} from '@agentic-os/sdk';

/** Server boundary: persisted registration/policy data is the only evaluator input. */
export class CapabilityGovernanceService {
  constructor(private readonly store: CapabilityGovernanceStore) {}

  register(capability: GovernedCapability): Promise<GovernedCapability> {
    return this.store.saveCapability(capability);
  }

  setActivePolicy(policy: CapabilityPolicy): Promise<CapabilityPolicy> {
    return this.store.saveActivePolicy(policy);
  }

  async evaluate(request: CapabilityRequest): Promise<PolicyEvaluation> {
    const [capabilities, policy] = await Promise.all([
      this.store.listCapabilities(),
      this.store.getActivePolicy(),
    ]);
    const inventory = new CapabilityInventory();
    for (const capability of capabilities) inventory.register(capability);
    // An absent policy is intentionally a valid empty/default-deny policy.
    return evaluateCapabilityPolicy(inventory, policy ?? { version: 'none', rules: [] }, request);
  }
}
