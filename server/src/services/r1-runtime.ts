/**
 * Server composition root for the governed R1 service boundary.
 * Routes should receive this runtime rather than importing a database client
 * directly. Persistence is supplied by the adapter, keeping local and shared
 * deployments substitutable.
 */
import {
  createSqlR1Repositories,
  R1Service,
  SqlCapabilityGovernanceStore,
  type CapabilityGovernanceStore,
  type R1Repositories,
  type R1ServiceOptions,
  type SqlExecutor,
} from '@agentic-os/sdk';
import { CapabilityGovernanceService } from './capability-governance.js';

export interface R1Runtime {
  readonly repositories: R1Repositories;
  readonly service: R1Service;
  readonly governance: CapabilityGovernanceService;
}

export function createR1Runtime(
  repositories: R1Repositories,
  governanceStore: CapabilityGovernanceStore,
  options?: R1ServiceOptions,
): R1Runtime {
  return {
    repositories,
    service: new R1Service(repositories, options),
    governance: new CapabilityGovernanceService(governanceStore),
  };
}

/** Production composition path for a migrated SQL database. */
export function createSqlR1Runtime(
  executor: SqlExecutor,
  options?: R1ServiceOptions,
): R1Runtime {
  return createR1Runtime(
    createSqlR1Repositories(executor),
    new SqlCapabilityGovernanceStore(executor),
    options,
  );
}
