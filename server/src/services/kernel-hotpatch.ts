import { log } from '../lib/logging.js';

/**
 * Phase 11 — Task 11.33: Hot-Patch System.
 *
 * Allows live modules to be patched (replaced) at runtime and rolled back to the
 * previously active version. Each module keeps a version history; `rollback`
 * reverts to the previous version. Both a class API (`HotPatchRegistry`) and a
 * shared singleton + convenience functions are provided.
 */

export class HotPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HotPatchError';
  }
}

interface VersionedImpl {
  version: number;
  impl: unknown;
}

export class HotPatchRegistry {
  private readonly history = new Map<string, VersionedImpl[]>();
  private readonly active = new Map<string, number>();

  /** Apply a new implementation for a module; returns the new version number. */
  patch<T>(mod: string, impl: T): number {
    if (!mod || impl === undefined) {
      throw new HotPatchError('patch: module and impl are required');
    }
    const hist = this.history.get(mod) ?? [];
    const last = hist[hist.length - 1];
    const version = last ? last.version + 1 : 1;
    hist.push({ version, impl });
    this.history.set(mod, hist);
    this.active.set(mod, version);
    log.info('hotpatch_applied', { mod, version });
    return version;
  }

  rollback(mod: string): number {
    const hist = this.history.get(mod);
    if (!hist || hist.length === 0) {
      throw new HotPatchError(`rollback: no prior version for module "${mod}"`);
    }
    if (hist.length >= 2) hist.pop();
    const prev = hist[hist.length - 1];
    if (!prev) throw new HotPatchError(`rollback: no prior version for module "${mod}"`);
    this.active.set(mod, prev.version);
    log.info('hotpatch_rolled_back', { mod, version: prev.version });
    return prev.version;
  }

  getActiveVersion(mod: string): number | undefined {
    return this.active.get(mod);
  }

  getActiveImpl<T>(mod: string): T | undefined {
    const version = this.active.get(mod);
    if (version === undefined) return undefined;
    const hist = this.history.get(mod) ?? [];
    return hist.find((h) => h.version === version)?.impl as T | undefined;
  }

  listModules(): string[] {
    return [...this.history.keys()];
  }
}

export const hotPatchRegistry = new HotPatchRegistry();

export function patchModule<T>(mod: string, impl: T): number {
  return hotPatchRegistry.patch(mod, impl);
}

export function rollbackModule(mod: string): number {
  return hotPatchRegistry.rollback(mod);
}

// ── Phase-11 behavior-test surface ───────────────────────────────────────────

export interface HotpatchSpec {
  name: string;
  id?: string;
  apply?: () => void | Promise<void>;
  rollback?: () => void | Promise<void>;
}

const hotpatchStore = new Map<string, HotpatchSpec>();

export function applyHotpatch(spec: HotpatchSpec): string {
  const id = spec.id ?? spec.name;
  hotpatchStore.set(id, spec);
  const result = spec.apply?.();
  if (result instanceof Promise) {
    result.catch((e) =>
      log.error('hotpatch_apply_failed', { id, error: e instanceof Error ? e.message : String(e) })
    );
  }
  return id;
}

export function rollbackHotpatch(id: string): void {
  if (!hotpatchStore.has(id)) throw new HotPatchError(`rollbackHotpatch: unknown id "${id}"`);
  const spec = hotpatchStore.get(id);
  const result = spec?.rollback?.();
  if (result instanceof Promise) {
    result.catch((e) =>
      log.error('hotpatch_rollback_failed', {
        id,
        error: e instanceof Error ? e.message : String(e),
      })
    );
  }
  hotpatchStore.delete(id);
}

export function listHotpatches(): string[] {
  return [...hotpatchStore.keys()];
}
