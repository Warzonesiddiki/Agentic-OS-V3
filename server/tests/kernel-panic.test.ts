import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/logging.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../src/services/kernel.js', () => ({
  publishKernelEvent: vi.fn(),
  KERNEL_EVENTS: { PANIC: 'kernel.panic', RING_BUDGET_EXCEEDED: 'ring.budget_exceeded' },
}));

import {
  kernelPanic,
  isPanic,
  isEmergencyMode,
  clearEmergencyMode,
  registerPanicHandler,
  getLastPanicDump,
} from '../src/services/kernel-panic.js';
import { getMessageBus } from '../src/services/message-bus.js';

describe('kernel panic', () => {
  beforeEach(() => {
    clearEmergencyMode();
  });
  afterEach(() => {
    clearEmergencyMode();
  });

  it('enters emergency mode, halts workers, and broadcasts kernel.panic', async () => {
    const bus = getMessageBus();
    const handler = vi.fn();
    bus.subscribe('kernel-panic-listener', 'kernel.panic', handler);
    const halted = vi.fn();
    registerPanicHandler(halted);

    await kernelPanic('test reason', { foo: 'bar' });

    expect(isPanic()).toBe(true);
    expect(halted).toHaveBeenCalledTimes(1);
    const msgs = bus.getMessages({ types: ['kernel.panic'] });
    expect(msgs.length).toBeGreaterThan(0);
    expect(getLastPanicDump()?.reason).toBe('test reason');
  });

  it('does not re-halt when already in emergency mode', async () => {
    const halted = vi.fn();
    registerPanicHandler(halted);
    await kernelPanic('first');
    halted.mockClear();
    await kernelPanic('second');
    expect(halted).not.toHaveBeenCalled();
    expect(isPanic()).toBe(true);
  });

  it('clearEmergencyMode resets the flag', async () => {
    await kernelPanic('reason');
    expect(isPanic()).toBe(true);
    clearEmergencyMode();
    expect(isEmergencyMode()).toBe(false);
  });
});
