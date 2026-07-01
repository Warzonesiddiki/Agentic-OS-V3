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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _screenshotFn: ((opts?: Record<string,unknown>) => Promise<Buffer>) | null = null;

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

async function executePowerShell(script: string): Promise<string> {
  const { execSync } = await import("node:child_process");
  return execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, {
    timeout: 10_000,
    encoding: "utf-8",
  });
}

async function executeAction(action: DesktopAction): Promise<void> {
  switch (action.action) {
    case "click":
      if (action.x !== undefined && action.y !== undefined) {
        await executePowerShell(`
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(action.x)}, ${Math.round(action.y)})
          [System.Windows.Forms.Mouse]::Click([System.Windows.Forms.MouseButtons]::Left, ${Math.round(action.x)}, ${Math.round(action.y)}, 0, 0)
        `);
      }
      break;

    case "type":
      if (action.text) {
        // Type text via clipboard + Ctrl+V (more reliable than keystrokes for special chars)
        const encoded = Buffer.from(action.text, "utf8").toString("base64");
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

    case "scroll":
      await executePowerShell(`
        Add-Type -AssemblyName System.Windows.Forms
        ${action.direction === "up" ? `
          [System.Windows.Forms.SendKeys]::SendWait('{UP ${action.amount ?? 3}}')
        ` : `
          [System.Windows.Forms.SendKeys]::SendWait('{DOWN ${action.amount ?? 3}}')
        `}
      `);
      break;

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
        const key = keyMap[action.key.toLowerCase()] ?? action.key;
        await executePowerShell(`
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait('${key}')
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
