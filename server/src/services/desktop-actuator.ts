/**
 * desktop-actuator.ts — Cross-Platform Desktop GUI Actuation via VLM.
 * Captures screenshots (full or cropped), sends them to a VLM for analysis,
 * and executes the resulting actions (click, type, scroll, keypress, etc.)
 * using platform-appropriate automation abstraction.
 *
 * Backends:
 * - Windows (PowerShell + System.Windows.Forms)
 * - macOS (AppleScript / osascript + screencapture)
 * - Linux (xdotool + ImageMagick import)
 * - Headless (CI/Docker stub & log fallback)
 */

import { log } from '../lib/logging.js';
import { callVLM, parseDesktopActions, type DesktopAction } from './vlm.js';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/* ── Types & Interfaces ── */

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenshotOptions {
  format?: 'png';
  crop?: CropRegion;
}

export type ActuatorMode = 'windows' | 'mac' | 'linux' | 'headless';

export interface DesktopActuator {
  readonly mode: ActuatorMode;
  isAvailable(): Promise<boolean>;
  screenshot(opts?: ScreenshotOptions): Promise<string>;
  moveMouse(x: number, y: number): Promise<void>;
  click(x?: number, y?: number, button?: 'left' | 'right' | 'middle'): Promise<void>;
  type(text: string): Promise<void>;
  scroll(amount: number, direction?: 'up' | 'down'): Promise<void>;
  keypress(key: string): Promise<void>;
  getScreenSize(): Promise<{ width: number; height: number }>;
}

/* ── Parameter Sanitization ── */

/**
 * Sanitize a string parameter to prevent command injection in general shell executions.
 * Strips null bytes, shell metacharacters, and escapes double quotes.
 */
export function sanitizeShellArg(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/\0/g, '') // null bytes
    .replace(/[`|&;()$<>\n\r]/g, '') // shell metacharacters
    .replace(/"/g, '\\"'); // escape quotes
}

/**
 * Sanitize a string for safe inclusion in a PowerShell command.
 * Strips null bytes, backticks, metacharacters, subexpressions, and newlines.
 */
export function sanitizePs(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/\0/g, '')
    .replace(/[`|&;()]/g, '')
    .replace(/\$\(/g, '')
    .replace(/\$\{[^}]*\}/g, '')
    .replace(/[\r\n]/g, ' ');
}

/**
 * Sanitize a string for safe inclusion in AppleScript string literals.
 * Escapes backslashes, double quotes, and strips null bytes.
 */
export function sanitizeAppleScriptString(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/\0/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, ' ');
}

/* ── Event Rate Limiting (max 10 input events / sec) ── */

export class RateLimiter {
  private lastExecutionTime = 0;
  private readonly minIntervalMs: number;

  constructor(maxEventsPerSecond = 10) {
    this.minIntervalMs = 1000 / maxEventsPerSecond; // 100ms
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastExecutionTime;
    if (elapsed < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastExecutionTime = Date.now();
  }
}

/* ── Base Abstract Actuator ── */

export abstract class BaseDesktopActuator implements DesktopActuator {
  abstract readonly mode: ActuatorMode;
  protected rateLimiter = new RateLimiter(10);

  abstract isAvailable(): Promise<boolean>;
  abstract screenshot(opts?: ScreenshotOptions): Promise<string>;
  abstract getScreenSize(): Promise<{ width: number; height: number }>;

  protected abstract _moveMouse(x: number, y: number): Promise<void>;
  protected abstract _click(
    x?: number,
    y?: number,
    button?: 'left' | 'right' | 'middle'
  ): Promise<void>;
  protected abstract _type(text: string): Promise<void>;
  protected abstract _scroll(amount: number, direction?: 'up' | 'down'): Promise<void>;
  protected abstract _keypress(key: string): Promise<void>;

  async moveMouse(x: number, y: number): Promise<void> {
    await this.rateLimiter.throttle();
    return this._moveMouse(x, y);
  }

  async click(x?: number, y?: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    await this.rateLimiter.throttle();
    return this._click(x, y, button);
  }

  async type(text: string): Promise<void> {
    await this.rateLimiter.throttle();
    return this._type(text);
  }

  async scroll(amount: number, direction: 'up' | 'down' = 'down'): Promise<void> {
    await this.rateLimiter.throttle();
    return this._scroll(amount, direction);
  }

  async keypress(key: string): Promise<void> {
    await this.rateLimiter.throttle();
    return this._keypress(key);
  }
}

/* ── Windows Actuator Implementation ── */

export class WindowsActuator extends BaseDesktopActuator {
  readonly mode: ActuatorMode = 'windows';

  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'win32') return false;
    try {
      execFileSync('powershell', ['-NoProfile', '-Command', 'exit 0'], {
        timeout: 3000,
        windowsHide: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async executePowerShell(script: string): Promise<string> {
    return execFileSync('powershell', ['-NoProfile', '-Command', script], {
      timeout: 10_000,
      encoding: 'utf-8',
      windowsHide: true,
    });
  }

  async screenshot(opts?: ScreenshotOptions): Promise<string> {
    try {
      const crop = opts?.crop;
      const script = crop
        ? `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -AssemblyName System.Drawing
          $cropX = [Math]::Max(0, ${Math.round(crop.x)})
          $cropY = [Math]::Max(0, ${Math.round(crop.y)})
          $cropW = [Math]::Max(1, ${Math.round(crop.width)})
          $cropH = [Math]::Max(1, ${Math.round(crop.height)})
          $bmp = New-Object System.Drawing.Bitmap $cropW, $cropH
          $graphics = [System.Drawing.Graphics]::FromImage($bmp)
          $graphics.CopyFromScreen($cropX, $cropY, 0, 0, $bmp.Size)
          $ms = New-Object System.IO.MemoryStream
          $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
          [Convert]::ToBase64String($ms.ToArray())
        `
        : `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -AssemblyName System.Drawing
          $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
          $bmp = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
          $graphics = [System.Drawing.Graphics]::FromImage($bmp)
          $graphics.CopyFromScreen($screen.X, $screen.Y, 0, 0, $bmp.Size)
          $ms = New-Object System.IO.MemoryStream
          $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
          [Convert]::ToBase64String($ms.ToArray())
        `;
      const result = await this.executePowerShell(script);
      return result.trim();
    } catch {
      // Fallback to screenshot-desktop if available
      try {
        const mod = await import('screenshot-desktop');
        const img = await (mod as unknown as (opts?: unknown) => Promise<Buffer>)({
          format: 'png',
        });
        return img.toString('base64');
      } catch {
        log.warn('desktop_screenshot_failed_windows');
        return '';
      }
    }
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    try {
      const result = await this.executePowerShell(`
        Add-Type -AssemblyName System.Windows.Forms
        $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        "$($b.Width)x$($b.Height)"
      `);
      const [w, h] = result.trim().split('x').map(Number);
      if (w && h) return { width: w, height: h };
    } catch {
      // Fallback
    }
    return { width: 1920, height: 1080 };
  }

  protected async _moveMouse(x: number, y: number): Promise<void> {
    const safeX = Math.round(Number(x) || 0);
    const safeY = Math.round(Number(y) || 0);
    await this.executePowerShell(`
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${safeX}, ${safeY})
    `);
  }

  protected async _click(
    x?: number,
    y?: number,
    button: 'left' | 'right' | 'middle' = 'left'
  ): Promise<void> {
    const safeX = x !== undefined ? Math.round(Number(x) || 0) : null;
    const safeY = y !== undefined ? Math.round(Number(y) || 0) : null;
    const btnMap = {
      left: '[System.Windows.Forms.MouseButtons]::Left',
      right: '[System.Windows.Forms.MouseButtons]::Right',
      middle: '[System.Windows.Forms.MouseButtons]::Middle',
    };
    const psBtn = btnMap[button] || btnMap.left;

    let script = `Add-Type -AssemblyName System.Windows.Forms\n`;
    if (safeX !== null && safeY !== null) {
      script += `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${safeX}, ${safeY})\n`;
      script += `[System.Windows.Forms.Mouse]::Click(${psBtn}, ${safeX}, ${safeY}, 0, 0)\n`;
    } else {
      const pos = `$([System.Windows.Forms.Cursor]::Position)`;
      script += `[System.Windows.Forms.Mouse]::Click(${psBtn}, ${pos}.X, ${pos}.Y, 0, 0)\n`;
    }
    await this.executePowerShell(script);
  }

  protected async _type(text: string): Promise<void> {
    const safeText = sanitizePs(text);
    const encoded = Buffer.from(safeText, 'utf8').toString('base64');
    await this.executePowerShell(`
      Add-Type -AssemblyName System.Windows.Forms
      $bytes = [Convert]::FromBase64String('${encoded}')
      $text = [System.Text.Encoding]::UTF8.GetString($bytes)
      [System.Windows.Forms.Clipboard]::SetText($text)
      [System.Windows.Forms.SendKeys]::SendWait('^v')
      Start-Sleep -Milliseconds 50
    `);
  }

  protected async _scroll(amount: number, direction: 'up' | 'down' = 'down'): Promise<void> {
    const safeAmount = Math.min(Math.max(Math.round(Number(amount) || 3), 1), 50);
    const dir = direction === 'up' ? 'UP' : 'DOWN';
    await this.executePowerShell(`
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait('{${dir} ${safeAmount}}')
    `);
  }

  protected async _keypress(key: string): Promise<void> {
    const keyMap: Record<string, string> = {
      enter: '{ENTER}',
      return: '{ENTER}',
      tab: '{TAB}',
      escape: '{ESC}',
      esc: '{ESC}',
      backspace: '{BACKSPACE}',
      delete: '{DELETE}',
      space: ' ',
      up: '{UP}',
      down: '{DOWN}',
      left: '{LEFT}',
      right: '{RIGHT}',
      home: '{HOME}',
      end: '{END}',
      pageup: '{PGUP}',
      pagedown: '{PGDN}',
    };
    const mapped = keyMap[key.toLowerCase()];
    if (!mapped) {
      log.warn('desktop_unknown_key', { key });
      return;
    }
    await this.executePowerShell(`
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait('${mapped}')
    `);
  }
}

/* ── macOS Actuator Implementation ── */

export class MacOSActuator extends BaseDesktopActuator {
  readonly mode: ActuatorMode = 'mac';

  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'darwin') return false;
    try {
      execFileSync('osascript', ['-e', 'return 1'], { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  private async executeAppleScript(script: string): Promise<string> {
    return execFileSync('osascript', ['-e', script], {
      timeout: 10_000,
      encoding: 'utf-8',
    });
  }

  async screenshot(opts?: ScreenshotOptions): Promise<string> {
    const tmpFile = path.join(os.tmpdir(), `mac_shot_${randomUUID().slice(0, 8)}.png`);
    try {
      const args = ['-x'];
      if (opts?.crop) {
        const { x, y, width, height } = opts.crop;
        args.push(`-R${Math.round(x)},${Math.round(y)},${Math.round(width)},${Math.round(height)}`);
      }
      args.push(tmpFile);
      execFileSync('screencapture', args, { timeout: 10_000 });
      const buffer = fs.readFileSync(tmpFile);
      return buffer.toString('base64');
    } catch (e) {
      log.warn('desktop_screenshot_failed_mac', {
        error: e instanceof Error ? e.message : String(e),
      });
      return '';
    } finally {
      if (fs.existsSync(tmpFile)) {
        try {
          fs.unlinkSync(tmpFile);
        } catch (err) {
          // Ignore cleanup errors but avoid silent empty block lints
          log.debug('desktop_unlink_failed_mac', { path: tmpFile, error: String(err) });
        }
      }
    }
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    try {
      const res = await this.executeAppleScript(
        'tell application "Finder" to get bounds of window of desktop'
      );
      const parts = res.trim().split(',').map(Number);
      const w = parts[2];
      const h = parts[3];
      if (w !== undefined && h !== undefined && !isNaN(w) && !isNaN(h)) {
        return { width: w, height: h };
      }
    } catch {
      // Fallback
    }
    return { width: 1920, height: 1080 };
  }

  protected async _moveMouse(x: number, y: number): Promise<void> {
    const safeX = Math.round(Number(x) || 0);
    const safeY = Math.round(Number(y) || 0);
    await this.executeAppleScript(`
      tell application "System Events"
        click at {${safeX}, ${safeY}}
      end tell
    `);
  }

  protected async _click(
    x?: number,
    y?: number,
    _button: 'left' | 'right' | 'middle' = 'left'
  ): Promise<void> {
    if (x !== undefined && y !== undefined) {
      const safeX = Math.round(Number(x) || 0);
      const safeY = Math.round(Number(y) || 0);
      await this.executeAppleScript(`
        tell application "System Events"
          click at {${safeX}, ${safeY}}
        end tell
      `);
    } else {
      await this.executeAppleScript(`
        tell application "System Events"
          click
        end tell
      `);
    }
  }

  protected async _type(text: string): Promise<void> {
    const safeText = sanitizeAppleScriptString(text);
    await this.executeAppleScript(`
      tell application "System Events"
        keystroke "${safeText}"
      end tell
    `);
  }

  protected async _scroll(amount: number, direction: 'up' | 'down' = 'down'): Promise<void> {
    const safeAmount = Math.min(Math.max(Math.round(Number(amount) || 3), 1), 50);
    const keyCode = direction === 'up' ? 126 : 125;
    let script = 'tell application "System Events"\n';
    for (let i = 0; i < safeAmount; i++) {
      script += `  key code ${keyCode}\n`;
    }
    script += 'end tell';
    await this.executeAppleScript(script);
  }

  protected async _keypress(key: string): Promise<void> {
    const macKeyMap: Record<string, number> = {
      enter: 36,
      return: 36,
      tab: 48,
      space: 49,
      escape: 53,
      esc: 53,
      backspace: 51,
      delete: 117,
      up: 126,
      down: 125,
      left: 123,
      right: 124,
      home: 115,
      end: 119,
      pageup: 116,
      pagedown: 121,
    };
    const code = macKeyMap[key.toLowerCase()];
    if (!code) {
      log.warn('desktop_unknown_key_mac', { key });
      return;
    }
    await this.executeAppleScript(`
      tell application "System Events"
        key code ${code}
      end tell
    `);
  }
}

/* ── Linux Actuator Implementation ── */

export class LinuxActuator extends BaseDesktopActuator {
  readonly mode: ActuatorMode = 'linux';

  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'linux') return false;
    try {
      execFileSync('which', ['xdotool'], { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async screenshot(opts?: ScreenshotOptions): Promise<string> {
    const tmpFile = path.join(os.tmpdir(), `linux_shot_${randomUUID().slice(0, 8)}.png`);
    try {
      const args = ['-window', 'root'];
      if (opts?.crop) {
        const { x, y, width, height } = opts.crop;
        args.push(
          '-crop',
          `${Math.round(width)}x${Math.round(height)}+${Math.round(x)}+${Math.round(y)}`
        );
      }
      args.push(tmpFile);
      execFileSync('import', args, { timeout: 10_000 });
      const buffer = fs.readFileSync(tmpFile);
      return buffer.toString('base64');
    } catch (e) {
      log.warn('desktop_screenshot_failed_linux', {
        error: e instanceof Error ? e.message : String(e),
      });
      return '';
    } finally {
      if (fs.existsSync(tmpFile)) {
        try {
          fs.unlinkSync(tmpFile);
        } catch (err) {
          // Ignore cleanup errors but avoid silent empty block lints
          log.debug('desktop_unlink_failed_linux', { path: tmpFile, error: String(err) });
        }
      }
    }
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    try {
      const res = execFileSync('xdotool', ['getdisplaygeometry'], {
        timeout: 5000,
        encoding: 'utf-8',
      });
      const [w, h] = res.trim().split(/\s+/).map(Number);
      if (w && h) return { width: w, height: h };
    } catch {
      // Fallback
    }
    return { width: 1920, height: 1080 };
  }

  protected async _moveMouse(x: number, y: number): Promise<void> {
    const safeX = Math.round(Number(x) || 0);
    const safeY = Math.round(Number(y) || 0);
    execFileSync('xdotool', ['mousemove', String(safeX), String(safeY)], { timeout: 5000 });
  }

  protected async _click(
    x?: number,
    y?: number,
    button: 'left' | 'right' | 'middle' = 'left'
  ): Promise<void> {
    const btnMap: Record<string, string> = { left: '1', middle: '2', right: '3' };
    const btnNum = btnMap[button] || '1';
    const args: string[] = [];
    if (x !== undefined && y !== undefined) {
      args.push(
        'mousemove',
        String(Math.round(Number(x) || 0)),
        String(Math.round(Number(y) || 0))
      );
    }
    args.push('click', btnNum);
    execFileSync('xdotool', args, { timeout: 5000 });
  }

  protected async _type(text: string): Promise<void> {
    const safeText = sanitizeShellArg(text);
    execFileSync('xdotool', ['type', '--', safeText], { timeout: 5000 });
  }

  protected async _scroll(amount: number, direction: 'up' | 'down' = 'down'): Promise<void> {
    const safeAmount = Math.min(Math.max(Math.round(Number(amount) || 3), 1), 50);
    const btnNum = direction === 'up' ? '4' : '5';
    execFileSync('xdotool', ['click', '--repeat', String(safeAmount), btnNum], { timeout: 5000 });
  }

  protected async _keypress(key: string): Promise<void> {
    const linuxKeyMap: Record<string, string> = {
      enter: 'Return',
      return: 'Return',
      tab: 'Tab',
      escape: 'Escape',
      esc: 'Escape',
      backspace: 'BackSpace',
      delete: 'Delete',
      space: 'space',
      up: 'Up',
      down: 'Down',
      left: 'Left',
      right: 'Right',
      home: 'Home',
      end: 'End',
      pageup: 'Page_Up',
      pagedown: 'Page_Down',
    };
    const mappedKey = linuxKeyMap[key.toLowerCase()];
    if (!mappedKey) {
      log.warn('desktop_unknown_key_linux', { key });
      return;
    }
    execFileSync('xdotool', ['key', mappedKey], { timeout: 5000 });
  }
}

/* ── Headless Actuator Implementation (Docker / CI Fallback) ── */

export class HeadlessActuator extends BaseDesktopActuator {
  readonly mode: ActuatorMode = 'headless';

  static readonly STUB_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async screenshot(_opts?: ScreenshotOptions): Promise<string> {
    log.info('headless_actuator_screenshot', { cropped: !!_opts?.crop });
    return HeadlessActuator.STUB_PNG_BASE64;
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    return { width: 1920, height: 1080 };
  }

  protected async _moveMouse(x: number, y: number): Promise<void> {
    log.info('headless_actuator_moveMouse', { x, y });
  }

  protected async _click(
    x?: number,
    y?: number,
    button: 'left' | 'right' | 'middle' = 'left'
  ): Promise<void> {
    log.info('headless_actuator_click', { x, y, button });
  }

  protected async _type(text: string): Promise<void> {
    log.info('headless_actuator_type', { text: text.slice(0, 30) });
  }

  protected async _scroll(amount: number, direction: 'up' | 'down' = 'down'): Promise<void> {
    log.info('headless_actuator_scroll', { amount, direction });
  }

  protected async _keypress(key: string): Promise<void> {
    log.info('headless_actuator_keypress', { key });
  }
}

/* ── Actuator Selection & Factory ── */

let _cachedActuator: DesktopActuator | null = null;

export async function createActuatorForMode(mode: ActuatorMode): Promise<DesktopActuator> {
  let actuator: DesktopActuator;
  switch (mode) {
    case 'windows':
      actuator = new WindowsActuator();
      break;
    case 'mac':
      actuator = new MacOSActuator();
      break;
    case 'linux':
      actuator = new LinuxActuator();
      break;
    case 'headless':
    default:
      actuator = new HeadlessActuator();
      break;
  }

  if (mode !== 'headless') {
    const available = await actuator.isAvailable();
    if (!available) {
      log.warn('desktop_actuator_unavailable_fallback', { requestedMode: mode });
      return new HeadlessActuator();
    }
  }

  return actuator;
}

export async function resolveActuatorMode(): Promise<ActuatorMode> {
  const envMode = (process.env.NEXUS_GUI_MODE || process.env.DESKTOP_ACTUATOR_MODE)?.toLowerCase();
  if (envMode === 'windows' || envMode === 'win32') return 'windows';
  if (envMode === 'mac' || envMode === 'darwin' || envMode === 'macos') return 'mac';
  if (envMode === 'linux') return 'linux';
  if (envMode === 'headless') return 'headless';

  switch (process.platform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'mac';
    case 'linux':
      return 'linux';
    default:
      return 'headless';
  }
}

export function getDesktopActuatorSync(): DesktopActuator {
  if (_cachedActuator) return _cachedActuator;
  const envMode = (process.env.NEXUS_GUI_MODE || process.env.DESKTOP_ACTUATOR_MODE)?.toLowerCase();
  if (envMode === 'headless') {
    _cachedActuator = new HeadlessActuator();
    return _cachedActuator;
  }
  if (process.platform === 'win32') _cachedActuator = new WindowsActuator();
  else if (process.platform === 'darwin') _cachedActuator = new MacOSActuator();
  else if (process.platform === 'linux') _cachedActuator = new LinuxActuator();
  else _cachedActuator = new HeadlessActuator();

  return _cachedActuator;
}

export async function getDesktopActuator(forceMode?: ActuatorMode): Promise<DesktopActuator> {
  if (forceMode) {
    return createActuatorForMode(forceMode);
  }
  if (_cachedActuator) return _cachedActuator;
  const mode = await resolveActuatorMode();
  _cachedActuator = await createActuatorForMode(mode);
  return _cachedActuator;
}

export function resetDesktopActuator(): void {
  _cachedActuator = null;
}

/* ── High-Level Actuation Loop ── */

export interface ActuationResult {
  succeeded: boolean;
  actionsExecuted: number;
  summary: string;
  screenshotCount: number;
}

/**
 * Run a desktop actuation loop:
 * 1. Capture screenshot (via DesktopActuator backend)
 * 2. Send to VLM with the current prompt
 * 3. Parse and execute returned actions
 * 4. Repeat until "done" action or max iterations
 */
export async function runDesktopActuation(
  taskPrompt: string,
  maxIterations = 20,
  customActuator?: DesktopActuator
): Promise<ActuationResult> {
  const actuator = customActuator ?? (await getDesktopActuator());
  const traceId = `vlm_${randomUUID().slice(0, 8)}`;
  log.info('desktop_actuation_start', {
    traceId,
    prompt: taskPrompt.slice(0, 100),
    mode: actuator.mode,
  });

  let actionsExecuted = 0;
  let screenshotCount = 0;
  let summary = 'No summary provided';

  for (let i = 0; i < maxIterations; i++) {
    const screenshot = await actuator.screenshot();
    screenshotCount++;
    if (!screenshot) {
      log.warn('desktop_actuation_no_screenshot', { traceId, iteration: i });
      return {
        succeeded: false,
        actionsExecuted,
        summary: 'Screenshot capture failed',
        screenshotCount,
      };
    }

    let actions: DesktopAction[];
    try {
      const vlmResponse = await callVLM({
        prompt:
          i === 0
            ? `You are a desktop automation agent. Your task: ${taskPrompt}\n\nRespond with one JSON action per line. Available actions: click, type, scroll, keypress, screenshot, done.\nFirst, examine the screenshot and determine what action to take.`
            : `Continue the task: ${taskPrompt}\n\nCurrent iteration ${i + 1}/${maxIterations}. Respond with the next action as JSON.`,
        imageBase64: screenshot,
      });
      actions = parseDesktopActions(vlmResponse.content);
    } catch (e) {
      log.error('desktop_actuation_vlm_failed', {
        traceId,
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        succeeded: false,
        actionsExecuted,
        summary: `VLM error: ${e instanceof Error ? e.message : 'unknown'}`,
        screenshotCount,
      };
    }

    for (const action of actions) {
      if (action.action === 'done') {
        summary = action.summary ?? 'Task completed';
        log.info('desktop_actuation_done', { traceId, actionsExecuted, screenshotCount, summary });
        return { succeeded: true, actionsExecuted, summary, screenshotCount };
      }
      if (action.action === 'screenshot') {
        break; // Re-capture in next iteration
      }
      try {
        await dispatchAction(actuator, action);
        actionsExecuted++;
      } catch (e) {
        log.warn('desktop_actuation_action_failed', {
          traceId,
          action: action.action,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Small delay between iterations to let UI settle
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  log.info('desktop_actuation_max_iterations', { traceId, actionsExecuted, screenshotCount });
  return {
    succeeded: true,
    actionsExecuted,
    summary: `Reached max iterations (${maxIterations})`,
    screenshotCount,
  };
}

async function dispatchAction(actuator: DesktopActuator, action: DesktopAction): Promise<void> {
  switch (action.action) {
    case 'click': {
      const x = action.x !== undefined ? Number(action.x) : undefined;
      const y = action.y !== undefined ? Number(action.y) : undefined;
      await actuator.click(x, y, 'left');
      break;
    }
    case 'type': {
      if (action.text) {
        await actuator.type(action.text);
      }
      break;
    }
    case 'scroll': {
      const amount = Math.min(Math.max(Math.round(Number(action.amount) || 3), 1), 50);
      const dir = action.direction === 'up' ? 'up' : 'down';
      await actuator.scroll(amount, dir);
      break;
    }
    case 'keypress': {
      if (action.key) {
        await actuator.keypress(action.key);
      }
      break;
    }
  }
}
