import { describe, it, expect } from 'vitest';
import {
  BootstrapGraph,
  bootstrapServices,
  BootstrapCycleError,
  type KernelService,
} from '../src/services/kernel-bootstrap.js';

const svc = (
  name: string,
  dependsOn: string[] = [],
  init: () => Promise<void> = async () => {}
): KernelService => ({ name, dependsOn, init });

describe('BootstrapGraph.order', () => {
  it('orders services by dependency', () => {
    const a = svc('a');
    const b = svc('b', ['a']);
    const c = svc('c', ['b']);
    const graph = new BootstrapGraph();
    graph.addAll([c, b, a]);
    const order = graph.order().map((s) => s.name);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  it('throws BootstrapCycleError on a circular dependency', () => {
    const a = svc('a', ['b']);
    const b = svc('b', ['a']);
    const graph = new BootstrapGraph();
    graph.addAll([a, b]);
    expect(() => graph.order()).toThrow(BootstrapCycleError);
  });

  it('throws on an unknown dependency', () => {
    const graph = new BootstrapGraph();
    graph.add(svc('x', ['missing']));
    expect(() => graph.order()).toThrow(/unknown service/);
  });

  it('handles diamond dependencies', () => {
    const base = svc('base');
    const left = svc('left', ['base']);
    const right = svc('right', ['base']);
    const top = svc('top', ['left', 'right']);
    const graph = new BootstrapGraph();
    graph.addAll([top, right, left, base]);
    const names = graph.order().map((s) => s.name);
    expect(names.indexOf('base')).toBeLessThan(names.indexOf('left'));
    expect(names.indexOf('base')).toBeLessThan(names.indexOf('right'));
    expect(names.indexOf('left')).toBeLessThan(names.indexOf('top'));
    expect(names.indexOf('right')).toBeLessThan(names.indexOf('top'));
  });
});

describe('bootstrapServices', () => {
  it('initializes services in dependency order', async () => {
    const calls: string[] = [];
    const a = svc('a', [], async () => {
      calls.push('a');
    });
    const b = svc('b', ['a'], async () => {
      calls.push('b');
    });
    await bootstrapServices([b, a]);
    expect(calls).toEqual(['a', 'b']);
  });

  it('fails fast on a cycle', async () => {
    const c1 = svc('c1', ['c2']);
    const c2 = svc('c2', ['c1']);
    await expect(bootstrapServices([c1, c2])).rejects.toThrow(BootstrapCycleError);
  });
});
