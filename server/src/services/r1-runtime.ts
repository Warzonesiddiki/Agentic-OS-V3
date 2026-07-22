/**
 * Server composition root for the governed R1 service boundary.
 * Routes should receive this runtime rather than importing a database client
 * directly. Persistence is supplied by the adapter, keeping local and shared
 * deployments substitutable.
 */
import {
  createSqlR1Repositories,
  ProjectTransferService,
  R1Service,
  SqlCapabilityGovernanceStore,
  type CapabilityGovernanceStore,
  type ImportApplyResult,
  type R1Repositories,
  type R1ServiceOptions,
  type SqlExecutor,
} from '@agentic-os/sdk';
import { CapabilityGovernanceService } from './capability-governance.js';

export interface R1Runtime {
  readonly repositories: R1Repositories;
  readonly service: R1Service;
  readonly governance: CapabilityGovernanceService;
  readonly transfer: ProjectTransferService;
  /**
   * Apply a project import. SQL-composed runtimes default to a real backend
   * transaction (see `importProjectAtomically`); generic runtimes rely on the
   * transfer service's reject-before-write validation gate.
   */
  applyProjectImport(candidate: unknown): Promise<ImportApplyResult>;
}

export function createR1Runtime(
  repositories: R1Repositories,
  governanceStore: CapabilityGovernanceStore,
  options?: R1ServiceOptions,
  runInTransaction?: <T>(fn: () => Promise<T>) => Promise<T>,
): R1Runtime {
  return {
    repositories,
    service: new R1Service(repositories, options),
    governance: new CapabilityGovernanceService(governanceStore),
    transfer: new ProjectTransferService(repositories),
    applyProjectImport: (candidate) =>
      new ProjectTransferService(repositories).applyImport(candidate, runInTransaction),
  };
}

/** Production composition path for a migrated SQL database. */
export function createSqlR1Runtime(
  executor: SqlExecutor,
  options?: R1ServiceOptions,
  runInTransaction?: <T>(fn: () => Promise<T>) => Promise<T>,
): R1Runtime {
  const runtime = createR1Runtime(
    createSqlR1Repositories(executor),
    new SqlCapabilityGovernanceStore(executor),
    options,
    runInTransaction,
  );
  if (runInTransaction) return runtime;
  // Default production behavior: atomic apply against the live backend.
  return { ...runtime, applyProjectImport: (candidate) => importProjectAtomically(candidate, options) };
}

/**
 * Backend-correct atomicity for project import apply (E1-S3, AC5):
 * - SQLite: the shared native connection is wrapped in BEGIN/COMMIT by the
 *   application transaction helper, so every repository write participates in
 *   the same transaction and an interrupted import rolls back entirely.
 * - PostgreSQL: `sql.begin()` binds a dedicated connection; a
 *   transaction-scoped repository set is composed for the callback's duration
 *   so no statement can escape the transaction.
 */
export async function importProjectAtomically(
  candidate: unknown,
  options?: R1ServiceOptions,
): Promise<ImportApplyResult> {
  const client = await import('../db/client.js');
  if (client.isSqlite) {
    const service = new ProjectTransferService(
      createSqlR1Repositories(client.createApplicationSqlExecutor()),
      options ? { now: options.now } : undefined,
    );
    return client.withTransaction(() => service.applyImport(candidate));
  }
  const pg = client.getPgClient();
  if (!pg) throw new Error('PostgreSQL client was not initialized.');
  return pg.begin(async (tx) => {
    const txExecutor: SqlExecutor = {
      async query<T extends object>(statement: string, parameters: readonly unknown[] = []): Promise<readonly T[]> {
        return (await tx.unsafe(statement, [...parameters] as never[])) as T[];
      },
    };
    const service = new ProjectTransferService(
      createSqlR1Repositories(txExecutor),
      options ? { now: options.now } : undefined,
    );
    return service.applyImport(candidate);
  });
}
