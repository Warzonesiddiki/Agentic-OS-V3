import { db } from '../../db/client.js';
import { selfOptParamVersions } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { SelfOptController, selfOptController } from './controller.js';
import { ALL_TUNERS } from './tuners.js';
import { log } from '../../lib/logging.js';

let tickTimer: ReturnType<typeof setInterval> | null = null;
let tickMs = 60_000;

export function startSelfOptTick(opts: { intervalMs?: number; dryRun?: boolean } = {}): void {
  if (opts.intervalMs) tickMs = opts.intervalMs;
  const controller = new SelfOptController({ dryRunDefault: opts.dryRun ?? true });
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    controller.runCycle().catch((e) => log.warn('self_opt_tick_failed', { err: String(e) }));
  }, tickMs);
  log.info('self_opt_tick_started', { intervalMs: tickMs });
}

export function stopSelfOptTick(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  log.info('self_opt_tick_stopped', {});
}

export async function setSelfOptParam(
  key: string,
  value: number | string | boolean | object
): Promise<void> {
  const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const existing = await db
    .select({ id: selfOptParamVersions.id })
    .from(selfOptParamVersions)
    .where(eq(selfOptParamVersions.tunerId, key))
    .limit(1);
  const first = Array.isArray(existing) ? existing[0] : undefined;
  if (first) {
    await db
      .update(selfOptParamVersions)
      .set({ afterJson: JSON.parse(serialized), status: 'shadow' })
      .where(eq(selfOptParamVersions.id, first.id));
  } else {
    await db.insert(selfOptParamVersions).values({
      id: `v_${key}_${Date.now()}`,
      tunerId: key,
      ownerAgent: 'pulse',
      targetInterface: 'self-opt',
      beforeJson: {},
      afterJson: JSON.parse(serialized),
      status: 'shadow',
      createdAt: new Date(),
    });
  }
}

export async function getSelfOptParam(key: string): Promise<string | null> {
  const rows = await db
    .select({ afterJson: selfOptParamVersions.afterJson })
    .from(selfOptParamVersions)
    .where(eq(selfOptParamVersions.tunerId, key))
    .limit(1);
  const first = Array.isArray(rows) ? rows[0] : undefined;
  if (!first) return null;
  const v = (first as { afterJson: unknown }).afterJson;
  return v === undefined ? null : JSON.stringify(v);
}

export async function applyBootPersistedParams(): Promise<void> {
  const rows = await db.select().from(selfOptParamVersions);
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return;
  for (const r of list as Array<{
    tunerId: string;
    afterJson: Record<string, number | string | boolean>;
  }>) {
    const tuner = ALL_TUNERS.find((t) => r.tunerId === `tuner.${t.id}` || r.tunerId === t.id);
    if (!tuner) continue;
    try {
      if (r.afterJson) {
        await tuner.adapter.apply(r.afterJson);
      }
    } catch {
      log.warn('self_opt_boot_param_unparseable', { tunerId: r.tunerId });
    }
  }
  log.info('self_opt_boot_reconciled', { count: list.length });
}

export { selfOptController };
