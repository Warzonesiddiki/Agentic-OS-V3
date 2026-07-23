/**
 * E4-S4 Kill switch and quarantine enforcement
 * AC1: Enabling kill switch is authenticated, scoped, reasoned, audited
 * AC2: New mutations, tool calls, task claims, approvals blocked per policy
 * AC3: In-flight steps reach safe stop boundary or quarantine
 * AC4: Status/evidence reads remain available
 * AC5: Disable requires explicit authorization and is audited
 * AC6: Race tests cover enable during transaction, claim, approval, tool execution
 */

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { R1Repositories } from './repositories.js';
import type { ActionReceipt } from './r1-types.js';

export const KillSwitchStateSchema = z.object({
  id: z.string().min(1).default('global'),
  enabled: z.boolean(),
  reason: z.string().min(1).max(2000),
  scope: z.object({
    projectId: z.string().uuid().optional(),
    global: z.boolean().optional().default(false),
  }),
  enabledBy: z.string().min(1).max(255),
  enabledAt: z.string().datetime(),
  disabledBy: z.string().min(1).max(255).optional(),
  disabledAt: z.string().datetime().optional(),
});
export type KillSwitchState = z.infer<typeof KillSwitchStateSchema>;

export const QuarantineStateSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  reason: z.string().min(1),
  quarantinedAt: z.string().datetime(),
  quarantinedBy: z.string().min(1),
});
export type QuarantineState = z.infer<typeof QuarantineStateSchema>;

export interface KillSwitchRepository {
  get(): Promise<KillSwitchState | null>;
  save(state: KillSwitchState): Promise<KillSwitchState>;
  listQuarantined(projectId?: string): Promise<readonly QuarantineState[]>;
  quarantine(state: QuarantineState): Promise<QuarantineState>;
  releaseQuarantine(projectId: string, taskId: string): Promise<void>;
}

class InMemoryKillSwitch implements KillSwitchRepository {
  private current: KillSwitchState | null = null;
  private quarantined: QuarantineState[] = [];
  async get(): Promise<KillSwitchState | null> { return this.current; }
  async save(state: KillSwitchState): Promise<KillSwitchState> { this.current = state; return state; }
  async listQuarantined(projectId?: string): Promise<readonly QuarantineState[]> {
    return projectId ? this.quarantined.filter((q) => q.projectId === projectId) : [...this.quarantined];
  }
  async quarantine(state: QuarantineState): Promise<QuarantineState> { this.quarantined.push(state); return state; }
  async releaseQuarantine(projectId: string, taskId: string): Promise<void> {
    this.quarantined = this.quarantined.filter((q) => !(q.projectId === projectId && q.taskId === taskId));
  }
}

export interface KillSwitchOptions {
  readonly now?: () => string;
}

export class KillSwitchService {
  private readonly now: () => string;
  constructor(
    private readonly repos: R1Repositories,
    private readonly store: KillSwitchRepository = new InMemoryKillSwitch(),
    options: KillSwitchOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async isEnabled(projectId?: string): Promise<boolean> {
    const state = await this.store.get();
    if (!state || !state.enabled) return false;
    if (state.scope.global) return true;
    if (projectId && state.scope.projectId === projectId) return true;
    // if global disabled but scoped, only that project blocked
    return false;
  }

  async enable(input: { reason: string; actorId: string; projectId?: string; global?: boolean }): Promise<{ state: KillSwitchState; receipt: ActionReceipt }> {
    // AC1: authenticated, scoped, reasoned, audited - auth check is done at route layer; here we audit
    if (!input.reason || !input.actorId) throw new Error('Reason and actor required');
    const now = this.now();
    const state: KillSwitchState = {
      id: 'global',
      enabled: true,
      reason: input.reason,
      scope: { projectId: input.projectId, global: input.global ?? !input.projectId },
      enabledBy: input.actorId,
      enabledAt: now,
    };
    await this.store.save(state);
    const receipt: ActionReceipt = {
      id: randomUUID(),
      projectId: input.projectId ?? '00000000-0000-4000-a000-000000000000',
      correlationId: randomUUID(),
      kind: 'db_write',
      actor: input.actorId,
      decision: 'allow',
      payload: { operation: 'kill-switch.enable', reason: input.reason, global: state.scope.global, projectId: input.projectId },
      createdAt: now,
    };
    await this.repos.receipts.append(receipt);
    return { state, receipt };
  }

  async disable(input: { actorId: string; reason?: string }): Promise<{ state: KillSwitchState; receipt: ActionReceipt }> {
    // AC5: disable requires explicit authorization and is audited
    const current = await this.store.get();
    if (!current || !current.enabled) throw new Error('Kill switch not enabled');
    const now = this.now();
    const next: KillSwitchState = {
      ...current,
      enabled: false,
      disabledBy: input.actorId,
      disabledAt: now,
      reason: input.reason ?? current.reason,
    };
    await this.store.save(next);
    const receipt: ActionReceipt = {
      id: randomUUID(),
      projectId: current.scope.projectId ?? '00000000-0000-4000-a000-000000000000',
      correlationId: randomUUID(),
      kind: 'db_write',
      actor: input.actorId,
      decision: 'allow',
      payload: { operation: 'kill-switch.disable', reason: input.reason },
      createdAt: now,
    };
    await this.repos.receipts.append(receipt);
    return { state: next, receipt };
  }

  /** AC2: Check if mutation should be blocked */
  async assertMutationsAllowed(projectId: string): Promise<void> {
    if (await this.isEnabled(projectId)) throw new Error(`Kill switch enabled, mutations blocked for project ${projectId}`);
  }

  /** AC3: Quarantine in-flight task */
  async quarantineTask(projectId: string, taskId: string, reason: string, actorId: string): Promise<QuarantineState> {
    const state: QuarantineState = {
      projectId,
      taskId,
      reason,
      quarantinedAt: this.now(),
      quarantinedBy: actorId,
    };
    await this.store.quarantine(state);
    // Update task to quarantined-like failed state? For R1 we keep task state as is but track quarantine.
    // We also emit receipt.
    await this.repos.receipts.append({
      id: randomUUID(),
      projectId,
      correlationId: taskId,
      kind: 'db_write',
      actor: actorId,
      decision: 'deny',
      payload: { operation: 'task.quarantine', taskId, reason },
      createdAt: this.now(),
    } as any);
    return state;
  }

  async listQuarantined(projectId?: string): Promise<readonly QuarantineState[]> {
    return this.store.listQuarantined(projectId);
  }

  async status(): Promise<{ enabled: boolean; state: KillSwitchState | null; quarantinedCount: number }> {
    const state = await this.store.get();
    const quarantined = await this.store.listQuarantined();
    return { enabled: state?.enabled ?? false, state, quarantinedCount: quarantined.length };
  }
}

export function createInMemoryKillSwitchStore(): KillSwitchRepository {
  return new InMemoryKillSwitch();
}
