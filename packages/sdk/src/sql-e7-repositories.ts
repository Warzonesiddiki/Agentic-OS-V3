/**
 * SQL implementations for E7 - MCP, A2A, Sync
 */

import type { SqlExecutor } from './sql-repositories.js';
import type { MCPServer, MCPServerRepository } from './r1-mcp-adapter.js';
import type { AgentCard, AgentCardRepository, A2ATask, A2ATaskRepository } from './r1-a2a-adapter.js';
import type { SyncChange, SyncConflict, SyncRevision, SyncState, SyncStore } from './r1-sync.js';

function one<T>(rows: readonly T[]): T | null { return rows[0] ?? null; }
function iso(v: unknown): string { if (v instanceof Date) return v.toISOString(); return String(v); }
function json(v: unknown, fb: any = {}): any { if (typeof v !== 'string') return v ?? fb; try { return JSON.parse(v); } catch { return fb; } }

export class SqlMCPRepo implements MCPServerRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async list(owner: string): Promise<readonly MCPServer[]> {
    const rows = await this.sql.query<any>(`SELECT id, name, version, transport, endpoint, command, env, owner, scopes, enabled, auth FROM r1_mcp_servers WHERE owner=$1 ORDER BY id`, [owner]);
    return rows.map(r => ({
      id: r.id, name: r.name, version: r.version, transport: r.transport, endpoint: r.endpoint ?? undefined, command: r.command ?? undefined,
      env: json(r.env), owner: r.owner, scopes: json(r.scopes, []), enabled: r.enabled === 1 || r.enabled === true, auth: json(r.auth),
    } as MCPServer));
  }
  async get(id: string): Promise<MCPServer | null> {
    const row = one(await this.sql.query<any>(`SELECT id, name, version, transport, endpoint, command, env, owner, scopes, enabled, auth FROM r1_mcp_servers WHERE id=$1`, [id]));
    if (!row) return null;
    return {
      id: row.id, name: row.name, version: row.version, transport: row.transport, endpoint: row.endpoint ?? undefined, command: row.command ?? undefined,
      env: json(row.env), owner: row.owner, scopes: json(row.scopes, []), enabled: row.enabled === 1 || row.enabled === true, auth: json(row.auth),
    } as MCPServer;
  }
  async save(server: MCPServer): Promise<MCPServer> {
    const row = one(await this.sql.query<any>(`INSERT INTO r1_mcp_servers (id, name, version, transport, endpoint, command, env, owner, scopes, enabled, auth)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (id) DO UPDATE SET name=$2, version=$3, transport=$4, endpoint=$5, command=$6, env=$7, scopes=$9, enabled=$10, auth=$11
      RETURNING id, name, version, transport, endpoint, command, env, owner, scopes, enabled, auth`,
      [server.id, server.name, server.version, server.transport, server.endpoint ?? null, server.command ?? null, JSON.stringify(server.env), server.owner, JSON.stringify(server.scopes), server.enabled ? 1 : 0, JSON.stringify(server.auth)]));
    if (!row) throw new Error('MCP save failed');
    return {
      id: row.id, name: row.name, version: row.version, transport: row.transport, endpoint: row.endpoint ?? undefined, command: row.command ?? undefined,
      env: json(row.env), owner: row.owner, scopes: json(row.scopes, []), enabled: row.enabled === 1 || row.enabled === true, auth: json(row.auth),
    } as MCPServer;
  }
}

export class SqlA2ACardRepo implements AgentCardRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async get(id: string): Promise<AgentCard | null> {
    const row = one(await this.sql.query<any>(`SELECT id, name, version, endpoint, capabilities, auth, identity, extensions FROM r1_a2a_cards WHERE id=$1`, [id]));
    if (!row) return null;
    return { id: row.id, name: row.name, version: row.version, endpoint: row.endpoint, capabilities: json(row.capabilities, []), auth: json(row.auth), identity: json(row.identity), extensions: json(row.extensions, []) } as AgentCard;
  }
  async list(): Promise<readonly AgentCard[]> {
    const rows = await this.sql.query<any>(`SELECT id, name, version, endpoint, capabilities, auth, identity, extensions FROM r1_a2a_cards ORDER BY id`);
    return rows.map(r => ({ id: r.id, name: r.name, version: r.version, endpoint: r.endpoint, capabilities: json(r.capabilities, []), auth: json(r.auth), identity: json(r.identity), extensions: json(r.extensions, []) } as AgentCard));
  }
  async save(card: AgentCard): Promise<AgentCard> {
    const row = one(await this.sql.query<any>(`INSERT INTO r1_a2a_cards (id, name, version, endpoint, capabilities, auth, identity, extensions)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO UPDATE SET name=$2, version=$3, endpoint=$4, capabilities=$5, auth=$6, identity=$7, extensions=$8 RETURNING id, name, version, endpoint, capabilities, auth, identity, extensions`,
      [card.id, card.name, card.version, card.endpoint, JSON.stringify(card.capabilities), JSON.stringify(card.auth), JSON.stringify(card.identity), JSON.stringify(card.extensions)]));
    if (!row) throw new Error('A2A card save failed');
    return { id: row.id, name: row.name, version: row.version, endpoint: row.endpoint, capabilities: json(row.capabilities, []), auth: json(row.auth), identity: json(row.identity), extensions: json(row.extensions, []) } as AgentCard;
  }
}

export class SqlA2ATaskRepo implements A2ATaskRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async get(id: string): Promise<A2ATask | null> {
    const row = one(await this.sql.query<any>(`SELECT id, context_id AS "contextId", local_task_id AS "localTaskId", local_step_id AS "localStepId", agent_card_id AS "agentCardId", status, artifacts, created_at AS "createdAt", updated_at AS "updatedAt" FROM r1_a2a_tasks WHERE id=$1`, [id]));
    if (!row) return null;
    return { id: row.id, contextId: row.contextId, localTaskId: row.localTaskId, localStepId: row.localStepId ?? undefined, agentCardId: row.agentCardId, status: row.status, artifacts: json(row.artifacts, []), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) } as A2ATask;
  }
  async listForLocalTask(localTaskId: string): Promise<readonly A2ATask[]> {
    const rows = await this.sql.query<any>(`SELECT id, context_id AS "contextId", local_task_id AS "localTaskId", local_step_id AS "localStepId", agent_card_id AS "agentCardId", status, artifacts, created_at AS "createdAt", updated_at AS "updatedAt" FROM r1_a2a_tasks WHERE local_task_id=$1 ORDER BY created_at`, [localTaskId]);
    return rows.map(r => ({ id: r.id, contextId: r.contextId, localTaskId: r.localTaskId, localStepId: r.localStepId ?? undefined, agentCardId: r.agentCardId, status: r.status, artifacts: json(r.artifacts, []), createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) } as A2ATask));
  }
  async save(task: A2ATask): Promise<A2ATask> {
    const row = one(await this.sql.query<any>(`INSERT INTO r1_a2a_tasks (id, context_id, local_task_id, local_step_id, agent_card_id, status, artifacts, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, context_id AS "contextId", local_task_id AS "localTaskId", local_step_id AS "localStepId", agent_card_id AS "agentCardId", status, artifacts, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [task.id, task.contextId, task.localTaskId, task.localStepId ?? null, task.agentCardId, task.status, JSON.stringify(task.artifacts), task.createdAt, task.updatedAt]));
    if (!row) throw new Error('A2A task save failed');
    return { id: row.id, contextId: row.contextId, localTaskId: row.localTaskId, localStepId: row.localStepId ?? undefined, agentCardId: row.agentCardId, status: row.status, artifacts: json(row.artifacts, []), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) } as A2ATask;
  }
  async update(task: A2ATask): Promise<A2ATask> {
    const row = one(await this.sql.query<any>(`UPDATE r1_a2a_tasks SET status=$2, artifacts=$3, updated_at=$4 WHERE id=$1 RETURNING id, context_id AS "contextId", local_task_id AS "localTaskId", local_step_id AS "localStepId", agent_card_id AS "agentCardId", status, artifacts, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [task.id, task.status, JSON.stringify(task.artifacts), task.updatedAt]));
    if (!row) throw new Error('A2A task not found');
    return { id: row.id, contextId: row.contextId, localTaskId: row.localTaskId, localStepId: row.localStepId ?? undefined, agentCardId: row.agentCardId, status: row.status, artifacts: json(row.artifacts, []), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) } as A2ATask;
  }
}

export class SqlSyncStore implements SyncStore {
  constructor(private readonly sql: SqlExecutor) {}
  async getRevision(projectId: string): Promise<SyncRevision | null> {
    const row = one(await this.sql.query<any>(`SELECT project_id AS "projectId", revision, cursor, timestamp FROM r1_sync_revisions WHERE project_id=$1`, [projectId]));
    if (!row) return null;
    return { projectId: row.projectId, revision: row.revision, cursor: row.cursor, timestamp: iso(row.timestamp) } as SyncRevision;
  }
  async setRevision(rev: SyncRevision): Promise<SyncRevision> {
    const row = one(await this.sql.query<any>(`INSERT INTO r1_sync_revisions (project_id, revision, cursor, timestamp) VALUES ($1,$2,$3,$4)
      ON CONFLICT (project_id) DO UPDATE SET revision=$2, cursor=$3, timestamp=$4 RETURNING project_id AS "projectId", revision, cursor, timestamp`,
      [rev.projectId, rev.revision, rev.cursor, rev.timestamp]));
    if (!row) throw new Error('Revision save failed');
    return { projectId: row.projectId, revision: row.revision, cursor: row.cursor, timestamp: iso(row.timestamp) } as SyncRevision;
  }
  async listChanges(projectId: string, afterRevision: number): Promise<readonly SyncChange[]> {
    const rows = await this.sql.query<any>(`SELECT id, project_id AS "projectId", record_type AS "recordType", record_id AS "recordId", operation, payload, revision, origin, created_at AS "createdAt", hash FROM r1_sync_changes WHERE project_id=$1 AND revision>$2 ORDER BY revision`, [projectId, afterRevision]);
    return rows.map(r => ({ id: r.id, projectId: r.projectId, recordType: r.recordType, recordId: r.recordId, operation: r.operation, payload: json(r.payload), revision: r.revision, origin: r.origin, createdAt: iso(r.createdAt), hash: r.hash } as SyncChange));
  }
  async appendChange(change: SyncChange): Promise<SyncChange> {
    const row = one(await this.sql.query<any>(`INSERT INTO r1_sync_changes (id, project_id, record_type, record_id, operation, payload, revision, origin, created_at, hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, project_id AS "projectId", record_type AS "recordType", record_id AS "recordId", operation, payload, revision, origin, created_at AS "createdAt", hash`,
      [change.id, change.projectId, change.recordType, change.recordId, change.operation, JSON.stringify(change.payload), change.revision, change.origin, change.createdAt, change.hash]));
    if (!row) throw new Error('Change append failed');
    return { id: row.id, projectId: row.projectId, recordType: row.recordType, recordId: row.recordId, operation: row.operation, payload: json(row.payload), revision: row.revision, origin: row.origin, createdAt: iso(row.createdAt), hash: row.hash } as SyncChange;
  }
  async listConflicts(projectId: string): Promise<readonly SyncConflict[]> {
    const rows = await this.sql.query<any>(`SELECT id, project_id AS "projectId", record_type AS "recordType", record_id AS "recordId", local_change AS "localChange", remote_change AS "remoteChange", reason, status, created_at AS "createdAt", resolved_at AS "resolvedAt", resolved_by AS "resolvedBy" FROM r1_sync_conflicts WHERE project_id=$1 ORDER BY created_at`, [projectId]);
    return rows.map(r => ({
      id: r.id, projectId: r.projectId, recordType: r.recordType, recordId: r.recordId,
      localChange: json(r.localChange), remoteChange: json(r.remoteChange), reason: r.reason, status: r.status,
      createdAt: iso(r.createdAt), resolvedAt: r.resolvedAt ? iso(r.resolvedAt) : undefined, resolvedBy: r.resolvedBy ?? undefined,
    } as SyncConflict));
  }
  async saveConflict(conflict: SyncConflict): Promise<SyncConflict> {
    const row = one(await this.sql.query<any>(`INSERT INTO r1_sync_conflicts (id, project_id, record_type, record_id, local_change, remote_change, reason, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, project_id AS "projectId", record_type AS "recordType", record_id AS "recordId", local_change AS "localChange", remote_change AS "remoteChange", reason, status, created_at AS "createdAt"`,
      [conflict.id, conflict.projectId, conflict.recordType, conflict.recordId, JSON.stringify(conflict.localChange), JSON.stringify(conflict.remoteChange), conflict.reason, conflict.status, conflict.createdAt]));
    if (!row) throw new Error('Conflict save failed');
    return { id: row.id, projectId: row.projectId, recordType: row.recordType, recordId: row.recordId, localChange: json(row.localChange), remoteChange: json(row.remoteChange), reason: row.reason, status: row.status, createdAt: iso(row.createdAt) } as SyncConflict;
  }
  async updateConflict(conflict: SyncConflict): Promise<SyncConflict> {
    const row = one(await this.sql.query<any>(`UPDATE r1_sync_conflicts SET status=$2, resolved_at=$3, resolved_by=$4 WHERE id=$1 RETURNING id, project_id AS "projectId", record_type AS "recordType", record_id AS "recordId", local_change AS "localChange", remote_change AS "remoteChange", reason, status, created_at AS "createdAt", resolved_at AS "resolvedAt", resolved_by AS "resolvedBy"`,
      [conflict.id, conflict.status, conflict.resolvedAt ?? null, conflict.resolvedBy ?? null]));
    if (!row) throw new Error('Conflict not found');
    return {
      id: row.id, projectId: row.projectId, recordType: row.recordType, recordId: row.recordId,
      localChange: json(row.localChange), remoteChange: json(row.remoteChange), reason: row.reason, status: row.status,
      createdAt: iso(row.createdAt), resolvedAt: row.resolvedAt ? iso(row.resolvedAt) : undefined, resolvedBy: row.resolvedBy ?? undefined,
    } as SyncConflict;
  }
  async getState(projectId: string): Promise<SyncState | null> {
    const row = one(await this.sql.query<any>(`SELECT project_id AS "projectId", mode, last_cursor AS "lastCursor", last_sync_at AS "lastSyncAt", pending_changes AS "pendingChanges", conflicts FROM r1_sync_states WHERE project_id=$1`, [projectId]));
    if (!row) return null;
    return { projectId: row.projectId, mode: row.mode, lastCursor: row.lastCursor ?? undefined, lastSyncAt: row.lastSyncAt ? iso(row.lastSyncAt) : undefined, pendingChanges: row.pendingChanges, conflicts: row.conflicts } as SyncState;
  }
  async setState(state: SyncState): Promise<SyncState> {
    const row = one(await this.sql.query<any>(`INSERT INTO r1_sync_states (project_id, mode, last_cursor, last_sync_at, pending_changes, conflicts)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (project_id) DO UPDATE SET mode=$2, last_cursor=$3, last_sync_at=$4, pending_changes=$5, conflicts=$6 RETURNING project_id AS "projectId", mode, last_cursor AS "lastCursor", last_sync_at AS "lastSyncAt", pending_changes AS "pendingChanges", conflicts`,
      [state.projectId, state.mode, state.lastCursor ?? null, state.lastSyncAt ?? null, state.pendingChanges, state.conflicts]));
    if (!row) throw new Error('State save failed');
    return { projectId: row.projectId, mode: row.mode, lastCursor: row.lastCursor ?? undefined, lastSyncAt: row.lastSyncAt ? iso(row.lastSyncAt) : undefined, pendingChanges: row.pendingChanges, conflicts: row.conflicts } as SyncState;
  }
}
