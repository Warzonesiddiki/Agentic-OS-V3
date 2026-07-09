import { describe, it, expect, vi } from 'vitest';
import { ResourceQuotaEnforcer, wrapFs, wrapHttpOutbound } from '../src/services/resource-quota.js';
import { getMessageBus } from '../src/services/message-bus.js';

describe('ResourceQuotaEnforcer', () => {
  it('does not wait when within burst capacity', async () => {
    const now = 0;
    const sleep = vi.fn(async () => {});
    const enforcer = new ResourceQuotaEnforcer(
      'agent1',
      { diskWriteBps: 100, diskReadBps: 1_000_000, netEgressBps: 1_000_000 },
      { burstFactor: 1, clock: () => now, sleep }
    );
    await enforcer.limitWrite(100);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('throttles writes beyond capacity', async () => {
    const now = 0;
    const sleep = vi.fn(async () => {});
    const enforcer = new ResourceQuotaEnforcer(
      'agent1',
      { diskWriteBps: 100, diskReadBps: 1_000_000, netEgressBps: 1_000_000 },
      { burstFactor: 1, clock: () => now, sleep }
    );
    await enforcer.limitWrite(100);
    await enforcer.limitWrite(100);
    expect(sleep).toHaveBeenCalled();
  });

  it('emits an exceeded event when a single request exceeds burst capacity', async () => {
    const exceeded = vi.fn();
    const enforcer = new ResourceQuotaEnforcer(
      'agent2',
      { diskWriteBps: 10, diskReadBps: 1_000_000, netEgressBps: 1_000_000 },
      { burstFactor: 1, onExceeded: exceeded, sleep: async () => {} }
    );
    await expect(enforcer.limitWrite(500)).rejects.toThrow();
    expect(exceeded).toHaveBeenCalled();
    const bus = getMessageBus();
    expect(bus.getMessages({ types: ['ring.budget_exceeded'] }).length).toBeGreaterThan(0);
  });

  it('wrapFs throttles by direction', async () => {
    const enforcer = new ResourceQuotaEnforcer(
      'agent3',
      { diskWriteBps: 1_000_000, diskReadBps: 100, netEgressBps: 1_000_000 },
      { burstFactor: 1, sleep: async () => {} }
    );
    let captured = '';
    const read = wrapFs(enforcer, 'read', (bytes: number, ...rest: unknown[]) => {
      captured = `${bytes}-${rest[0] as string}`;
    });
    await read(50, 'x');
    expect(captured).toBe('50-x');
  });

  it('wrapHttpOutbound throttles egress', async () => {
    const enforcer = new ResourceQuotaEnforcer(
      'agent4',
      { diskWriteBps: 1_000_000, diskReadBps: 1_000_000, netEgressBps: 100 },
      { burstFactor: 1, sleep: async () => {} }
    );
    let captured = 0;
    const send = wrapHttpOutbound(enforcer, (bytes: number, ..._rest: unknown[]) => {
      captured = bytes * 2;
    });
    await send(50);
    expect(captured).toBe(100);
  });
});
