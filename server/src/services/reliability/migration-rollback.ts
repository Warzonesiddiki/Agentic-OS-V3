/** migration-rollback.ts — schema/data migration rollback harness. */
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../lib/errors.js';
import { appendAudit, Tx } from '../../lib/audit.js';
import { db } from '../../db/client.js';

export interface MigrationPhase {
  id: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
  appliedAt?: number;
}

const migrations = new Map<string, MigrationPhase>();

export function registerMigration(
  name: string,
  up: () => Promise<void>,
  down: () => Promise<void>
): MigrationPhase {
  const m: MigrationPhase = { id: name, up, down };
  migrations.set(name, m);
  return m;
}

export async function applyMigration(name: string, actor = 'migration'): Promise<void> {
  const m = migrations.get(name);
  if (!m) throw new ApiError('MIGRATION_NOT_FOUND', `No migration ${name}`);
  await m.up();
  m.appliedAt = Date.now();
  void appendAudit('migration.applied', { id: name }, actor, db as unknown as Tx);
}

export async function rollbackMigration(name: string, actor = 'migration'): Promise<void> {
  const m = migrations.get(name);
  if (!m) throw new ApiError('MIGRATION_NOT_FOUND', `No migration ${name}`);
  await m.down();
  m.appliedAt = undefined;
  void appendAudit('migration.rolledback', { id: name }, actor, db as unknown as Tx);
}

export interface RollbackPlan {
  id: string;
  migrationId: string;
  createdAt: number;
}

export function planRollback(migrationId: string): RollbackPlan {
  return { id: 'RB-' + randomUUID().slice(0, 8), migrationId, createdAt: Date.now() };
}

export function appliedList(): string[] {
  return [...migrations.values()].filter((m) => m.appliedAt).map((m) => m.id);
}
