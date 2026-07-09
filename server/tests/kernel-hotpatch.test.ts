import { describe, it, expect } from 'vitest';
import {
  HotPatchRegistry,
  patchModule,
  rollbackModule,
  hotPatchRegistry,
} from '../src/services/kernel-hotpatch.js';

describe('kernel-hotpatch', () => {
  it('patches and tracks the active version', async () => {
    const reg = new HotPatchRegistry();
    const v1 = await reg.patch('mod', { v: 1 });
    expect(v1).toBe(1);
    expect(reg.getActiveVersion('mod')).toBe(1);
    const v2 = await reg.patch('mod', { v: 2 });
    expect(v2).toBe(2);
    expect(reg.getActiveVersion('mod')).toBe(2);
    expect(reg.getActiveImpl('mod')).toEqual({ v: 2 });
  });

  it('rolls back to the previous version', async () => {
    const reg = new HotPatchRegistry();
    await reg.patch('m', 'a');
    await reg.patch('m', 'b');
    await reg.patch('m', 'c');
    expect(reg.getActiveVersion('m')).toBe(3);
    const rolled = reg.rollback('m');
    expect(rolled).toBe(2);
    expect(reg.getActiveImpl('m')).toBe('b');
  });

  it('does not roll back past the first version', async () => {
    const reg = new HotPatchRegistry();
    await reg.patch('x', 1);
    const v = reg.rollback('x');
    expect(v).toBe(1);
    expect(reg.getActiveVersion('x')).toBe(1);
  });

  it('module-level helpers delegate to the shared registry', async () => {
    const v = await patchModule('shared', 42);
    expect(v).toBe(1);
    expect(hotPatchRegistry.getActiveVersion('shared')).toBe(1);
    const r = rollbackModule('shared');
    expect(r).toBe(1);
  });

  it('throws when rolling back an unknown module', () => {
    const reg = new HotPatchRegistry();
    expect(() => reg.rollback('nope')).toThrow();
  });
});
