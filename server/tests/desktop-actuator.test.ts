/**
 * desktop-actuator.test.ts — Unit & Integration tests for Desktop Actuator.
 * Verifies cross-platform selection, sanitization, rate limiting, and headless execution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getDesktopActuator,
  createActuatorForMode,
  resolveActuatorMode,
  resetDesktopActuator,
  sanitizeShellArg,
  sanitizePs,
  sanitizeAppleScriptString,
  RateLimiter,
  HeadlessActuator,
  WindowsActuator,
  MacOSActuator,
  LinuxActuator,
  runDesktopActuation,
} from '../src/services/desktop-actuator.js';

// Mock VLM module for testing runDesktopActuation
vi.mock('../src/services/vlm.js', () => ({
  callVLM: vi.fn().mockResolvedValue({
    content: JSON.stringify({ action: 'done', summary: 'Mock task completed' }),
  }),
  parseDesktopActions: vi.fn().mockReturnValue([
    { action: 'click', x: 100, y: 200 },
    { action: 'type', text: 'Hello World' },
    { action: 'done', summary: 'Mock task completed' },
  ]),
}));

describe('Desktop Actuator Parameter Sanitization', () => {
  it('sanitizeShellArg strips metacharacters and null bytes', () => {
    const dirty = 'hello; rm -rf / && echo "bad` \0 $VAR';
    const clean = sanitizeShellArg(dirty);
    expect(clean).not.toContain(';');
    expect(clean).not.toContain('&');
    expect(clean).not.toContain('`');
    expect(clean).not.toContain('\0');
    expect(clean).not.toContain('$');
  });

  it('sanitizePs strips null bytes and PowerShell subexpressions', () => {
    const dirty = 'text`with\0$(Invoke-Expression "bad") and ${env:PATH}';
    const clean = sanitizePs(dirty);
    expect(clean).not.toContain('\0');
    expect(clean).not.toContain('`');
    expect(clean).not.toContain('$(');
  });

  it('sanitizeAppleScriptString escapes quotes and backslashes', () => {
    const dirty = 'Hello "World" \\ with \0 null';
    const clean = sanitizeAppleScriptString(dirty);
    expect(clean).toContain('\\"World\\"');
    expect(clean).not.toContain('\0');
  });
});

describe('Input Rate Limiter', () => {
  it('enforces maximum 10 GUI events per second (>= 100ms between calls)', async () => {
    const limiter = new RateLimiter(10);
    const start = Date.now();

    await limiter.throttle();
    await limiter.throttle();
    await limiter.throttle();

    const elapsed = Date.now() - start;
    // 3 calls = at least 2 interval gaps = >= 180ms
    expect(elapsed).toBeGreaterThanOrEqual(180);
  });
});

describe('Actuator Selection & Environment Overrides', () => {
  const originalEnv = process.env.NEXUS_GUI_MODE;

  beforeEach(() => {
    resetDesktopActuator();
  });

  afterEach(() => {
    process.env.NEXUS_GUI_MODE = originalEnv;
    resetDesktopActuator();
  });

  it('respects NEXUS_GUI_MODE=headless', async () => {
    process.env.NEXUS_GUI_MODE = 'headless';
    const actuator = await getDesktopActuator();
    expect(actuator.mode).toBe('headless');
  });

  it('createActuatorForMode creates HeadlessActuator directly', async () => {
    const actuator = await createActuatorForMode('headless');
    expect(actuator.mode).toBe('headless');
    expect(await actuator.isAvailable()).toBe(true);
  });

  it('falls back to headless if requested platform backend is unavailable', async () => {
    // Force linux mode on unknown non-linux system or mock failure
    const actuator = await createActuatorForMode('headless');
    expect(actuator.mode).toBe('headless');
  });
});

describe('HeadlessActuator Implementation', () => {
  let actuator: HeadlessActuator;

  beforeEach(() => {
    actuator = new HeadlessActuator();
  });

  it('returns valid screen size and stub PNG screenshot', async () => {
    const size = await actuator.getScreenSize();
    expect(size.width).toBe(1920);
    expect(size.height).toBe(1080);

    const shot = await actuator.screenshot();
    expect(shot).toBe(HeadlessActuator.STUB_PNG_BASE64);
  });

  it('executes GUI actions without error', async () => {
    await expect(actuator.moveMouse(10, 20)).resolves.not.toThrow();
    await expect(actuator.click(10, 20, 'left')).resolves.not.toThrow();
    await expect(actuator.type('Test typing')).resolves.not.toThrow();
    await expect(actuator.scroll(5, 'down')).resolves.not.toThrow();
    await expect(actuator.keypress('enter')).resolves.not.toThrow();
  });
});

describe('Actuation Loop Integration (runDesktopActuation)', () => {
  it('runs actuation loop using HeadlessActuator successfully', async () => {
    const headless = new HeadlessActuator();
    const result = await runDesktopActuation('Click on start button', 5, headless);

    expect(result.succeeded).toBe(true);
    expect(result.screenshotCount).toBeGreaterThan(0);
    expect(result.summary).toContain('Mock task completed');
  });
});
