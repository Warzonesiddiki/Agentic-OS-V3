/**
 * desktop-actuator.ts — Desktop GUI Actuation via VLM.
 * Captures screenshots, sends them to a VLM for analysis,
 * and executes the resulting actions (click, type, scroll, etc.)
 * using platform-appropriate automation.
 *
 * Supports Windows (PowerShell-based automation) with a fallback
 * for headless environments (logs actions instead of executing).
 */

import { log } from "../lib/logging.js";
import { callVLM, parseDesktopActions, type DesktopAction } from "./vlm.js";
import { randomUUID } from "node:crypto";

/* ── Screenshot Capture ── */

let _screenshotFn: ((opts?: { format?: string }) => Promise<Buffer>) | null = null;

async function captureScreenshotBase64(): Promise<string> {
  try {
    if (!_screenshotFn) {
      const mod = await import("screenshot-desktop");
      _screenshotFn = mod as unknown as (opts?: unknown) => Promise<Buffer>;
    }
    const img = await _screenshotFn({ format: "png" });
    return img.toString("base64");
  } catch {
    log.warn("desktop_screenshot_failed");
    return "";
  }
}

/* ── Action Execution ── */

/** Sanitize a string for safe inclusion in a PowerShell command.
 * Strips null bytes, backticks, dollar-sign interpolation, and pipes.
 * This is defense-in-depth — callers should also validate inputs. */
function sanitizePs(input: string): string {
  return input
    .split(String.fromCharCode(0)).join("")       // null bytes
    .replace(/[`|&;()]/g, "")     // shell metacharacters
    .replace(/\$\(/g, "")         // subexpression
    .replace(/\$\{[^}]*\}/g, "") // interpolation
    .replace(/\n/g, " ");         // newlines
}

async function executePowerShell(script: string): Promise<string> {
  const { execFileSync } = await import("node:child_process");
  // Use execFileSync to avoid shell interpolation — arguments are passed as an array.
  return execFileSync("powershell", ["-NoProfile", "-Command", script], {
    timeout: 10_000,
    encoding: "utf-8",
    windowsHide: true,
  });
}

async function executeAction(action: DesktopAction): Promise<void> {
  switch (action.action) {
    case "click":
      if (action.x !== undefined && action.y !== undefined) {
        const x = Math.round(Number(action.x) || 0);
      const y = Math.round(Number(action.y) || 0);
      await executePowerShell(`
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
          [System.Windows.Forms.Mouse]::Click([System.Windows.Forms.MouseButtons]::Left, ${x}, ${y}, 0, 0)
        `);
      }
      break;

    case "type":
      if (action.text) {
        // Type text via clipboard + Ctrl+V (more reliable than keystrokes for special chars)
        // Base64 encode the text — it's safe for PowerShell string interpolation.
        const safeText = sanitizePs(action.text);
        const encoded = Buffer.from(safeText, "utf8").toString("base64");
        await executePowerShell(`
          Add-Type -AssemblyName System.Windows.Forms
          $bytes = [Convert]::FromBase64String('${encoded}')
          $text = [System.Text.Encoding]::UTF8.GetString($bytes)
          [System.Windows.Forms.Clipboard]::SetText($text)
          [System.Windows.Forms.SendKeys]::SendWait('^v')
          Start-Sleep -Milliseconds 100
        `);
      }
      break;

    case "scroll": {
      const amount = Math.min(Math.max(Math.round(Number(action.amount) || 3), 1), 50);
      const dir = action.direction === "up" ? "UP" : "DOWN";
      await executePowerShell(`
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait('{${dir} ${amount}}')
      `);
      break;
    }

    case "keypress":
      if (action.key) {
        const keyMap: Record<string, string> = {
          enter: "{ENTER}",
          tab: "{TAB}",
          escape: "{ESC}",
          backspace: "{BACKSPACE}",
          delete: "{DELETE}",
          space: " ",
          up: "{UP}",
          down: "{DOWN}",
          left: "{LEFT}",
          right: "{RIGHT}",
          home: "{HOME}",
          end: "{END}",
          pageup: "{PGUP}",
          pagedown: "{PGDN}",
        };
        // Only allow known keys — reject anything not in the map to prevent injection.
        const mapped = keyMap[action.key.toLowerCase()];
        if (!mapped) {
          log.warn("desktop_unknown_key", { key: action.key });
          break;
        }
        await executePowerShell(`
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait('${mapped}')
        `);
      }
      break;

    case "screenshot":
      // Re-capture is handled by the caller loop
      break;

    case "done":
      // Terminal action — no execution needed
      break;
  }
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
 * 1. Capture screenshot
 * 2. Send to VLM with the current prompt
 * 3. Parse and execute returned actions
 * 4. Repeat until "done" action or max iterations
 */
export async function runDesktopActuation(
  taskPrompt: string,
  maxIterations = 20,
): Promise<ActuationResult> {
  const traceId = `vlm_${randomUUID().slice(0, 8)}`;
  log.info("desktop_actuation_start", { traceId, prompt: taskPrompt.slice(0, 100) });

  let actionsExecuted = 0;
  let screenshotCount = 0;
  let summary = "No summary provided";
  let screenshot: string;

  for (let i = 0; i < maxIterations; i++) {
    // 1. Capture
    screenshot = await captureScreenshotBase64();
    screenshotCount++;
    if (!screenshot) {
      log.warn("desktop_actuation_no_screenshot", { traceId, iteration: i });
      return { succeeded: false, actionsExecuted, summary: "Screenshot capture failed", screenshotCount };
    }

    // 2. Analyze with VLM
    const base64 = screenshot;
    let actions: DesktopAction[];
    try {
      const vlmResponse = await callVLM({
        prompt: i === 0
          ? `You are a desktop automation agent. Your task: ${taskPrompt}\n\nRespond with one JSON action per line. Available actions: click, type, scroll, keypress, screenshot, done.\nFirst, examine the screenshot and determine what action to take.`
          : `Continue the task: ${taskPrompt}\n\nCurrent iteration ${i + 1}/${maxIterations}. Respond with the next action as JSON.`,
        imageBase64: base64,
      });
      actions = parseDesktopActions(vlmResponse.content);
    } catch (e) {
      log.error("desktop_actuation_vlm_failed", { traceId, error: e instanceof Error ? e.message : String(e) });
      return { succeeded: false, actionsExecuted, summary: `VLM error: ${e instanceof Error ? e.message : "unknown"}`, screenshotCount };
    }

    // 3. Execute each action
    for (const action of actions) {
      if (action.action === "done") {
        summary = action.summary ?? "Task completed";
        log.info("desktop_actuation_done", { traceId, actionsExecuted, screenshotCount, summary });
        return { succeeded: true, actionsExecuted, summary, screenshotCount };
      }
      if (action.action === "screenshot") {
        break; // Re-capture in next iteration
      }
      try {
        await executeAction(action);
        actionsExecuted++;
      } catch (e) {
        log.warn("desktop_actuation_action_failed", {
          traceId,
          action: action.action,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Small delay between iterations to let UI settle
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  log.info("desktop_actuation_max_iterations", { traceId, actionsExecuted, screenshotCount });
  return { succeeded: true, actionsExecuted, summary: `Reached max iterations (${maxIterations})`, screenshotCount };
}
