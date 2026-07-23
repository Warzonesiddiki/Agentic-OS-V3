import type { SqlExecutor } from './sql-repositories.js';

export type EffectClaimState = 'claimed' | 'completed';

export interface EffectClaim {
  readonly projectId: string;
  readonly taskId: string;
  readonly correlationId: string;
  readonly operation: string;
  readonly state: EffectClaimState;
  readonly createdAt: string;
  readonly completedAt?: string;
}

export interface EffectClaimResult {
  readonly claim: EffectClaim;
  readonly acquired: boolean;
}

export interface EffectClaimStore {
  claim(input: Omit<EffectClaim, 'state' | 'createdAt' | 'completedAt'> & { readonly createdAt: string }): Promise<EffectClaimResult>;
  complete(input: Pick<EffectClaim, 'projectId' | 'taskId' | 'correlationId' | 'operation'> & { readonly completedAt: string }): Promise<EffectClaim>;
}

export class InMemoryEffectClaimStore implements EffectClaimStore {
  private readonly claims = new Map<string, EffectClaim>();

  async claim(input: Omit<EffectClaim, 'state' | 'createdAt' | 'completedAt'> & { readonly createdAt: string }): Promise<EffectClaimResult> {
    const key = claimKey(input);
    const existing = this.claims.get(key);
    if (existing) return { claim: existing, acquired: false };
    const claim: EffectClaim = { ...input, state: 'claimed' };
    this.claims.set(key, claim);
    return { claim, acquired: true };
  }

  async complete(input: Pick<EffectClaim, 'projectId' | 'taskId' | 'correlationId' | 'operation'> & { readonly completedAt: string }): Promise<EffectClaim> {
    const key = claimKey(input);
    const existing = this.claims.get(key);
    if (!existing) throw new Error('Effect claim not found');
    const completed: EffectClaim = { ...existing, state: 'completed', completedAt: input.completedAt };
    this.claims.set(key, completed);
    return completed;
  }
}

/** SQL-backed claim store. The composite primary key makes a claim atomic across workers. */
export class SqlEffectClaimStore implements EffectClaimStore {
  constructor(private readonly sql: SqlExecutor) {}

  async claim(input: Omit<EffectClaim, 'state' | 'createdAt' | 'completedAt'> & { readonly createdAt: string }): Promise<EffectClaimResult> {
    const rows = await this.sql.query<EffectClaim>(
      `INSERT INTO r1_effect_claims (project_id, task_id, correlation_id, operation, state, created_at)
       VALUES ($1,$2,$3,$4,'claimed',$5)
       ON CONFLICT (project_id, task_id, correlation_id, operation) DO NOTHING
       RETURNING project_id AS "projectId", task_id AS "taskId", correlation_id AS "correlationId", operation, state, created_at AS "createdAt", completed_at AS "completedAt"`,
      [input.projectId, input.taskId, input.correlationId, input.operation, input.createdAt],
    );
    const created = rows[0];
    if (created) return { claim: normalizeClaim(created), acquired: true };
    const existing = await this.sql.query<EffectClaim>(
      `SELECT project_id AS "projectId", task_id AS "taskId", correlation_id AS "correlationId", operation, state, created_at AS "createdAt", completed_at AS "completedAt"
       FROM r1_effect_claims WHERE project_id=$1 AND task_id=$2 AND correlation_id=$3 AND operation=$4`,
      [input.projectId, input.taskId, input.correlationId, input.operation],
    );
    const claim = existing[0];
    if (!claim) throw new Error('Effect claim was not persisted');
    return { claim: normalizeClaim(claim), acquired: false };
  }

  async complete(input: Pick<EffectClaim, 'projectId' | 'taskId' | 'correlationId' | 'operation'> & { readonly completedAt: string }): Promise<EffectClaim> {
    const rows = await this.sql.query<EffectClaim>(
      `UPDATE r1_effect_claims SET state='completed', completed_at=$5
       WHERE project_id=$1 AND task_id=$2 AND correlation_id=$3 AND operation=$4 AND state='claimed'
       RETURNING project_id AS "projectId", task_id AS "taskId", correlation_id AS "correlationId", operation, state, created_at AS "createdAt", completed_at AS "completedAt"`,
      [input.projectId, input.taskId, input.correlationId, input.operation, input.completedAt],
    );
    const claim = rows[0];
    if (!claim) throw new Error('Effect claim not found or already completed');
    return normalizeClaim(claim);
  }
}

function claimKey(input: Pick<EffectClaim, 'projectId' | 'taskId' | 'correlationId' | 'operation'>): string {
  return `${input.projectId}:${input.taskId}:${input.correlationId}:${input.operation}`;
}

function normalizeClaim(claim: EffectClaim): EffectClaim {
  return claim.completedAt == null ? { ...claim, completedAt: undefined } : claim;
}
