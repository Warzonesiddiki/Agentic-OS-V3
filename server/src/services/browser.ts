/**
 * services/browser.ts — Visual Web Automation Engine.
 *
 * Uses Playwright (if installed) to enable agents to navigate, click,
 * extract, and screenshot web pages. Falls back to a clear error if
 * Playwright isn't available — no silent mocks.
 *
 * Each browser action generates a cryptographic tool receipt and
 * appends to the audit chain.
 */
import { logToolReceipt } from "./audit-engine.js";

export interface BrowserResult {
  ok: boolean;
  url?: string;
  title?: string;
  text?: string;
  screenshot?: string; // base64
  error?: string;
  durationMs: number;
}

// Lazy-load Playwright — the server works without it; browser tools just error.
let _chromium: any = null;
async function getChromium(): Promise<any> {
  if (_chromium === false) return null;
  if (_chromium) return _chromium;
  try {
    const pw = await import("playwright");
    _chromium = pw.chromium;
    return _chromium;
  } catch (e) {
    _chromium = false;
    // Log once so the operator knows browser tools are unavailable.
    const { log } = await import("../lib/logging.js");
    log.warn("playwright_not_available", {
      error: e instanceof Error ? e.message : String(e),
      fix: "Run: npm install playwright && npx playwright install chromium",
    });
    return null;
  }
}

async function withBrowser<T>(
  fn: (page: any) => Promise<T>
): Promise<T> {
  const chromium = await getChromium();
  if (!chromium) {
    throw new Error("Playwright is not installed. Run: npm install playwright && npx playwright install chromium");
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    return await fn(page);
  } finally {
    await browser.close();
  }
}

export async function browserNavigate(url: string, agentId: string, actor: string): Promise<BrowserResult> {
  const start = Date.now();
  try {
    const result = await withBrowser(async (page) => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      const title = await page.title();
      const text = (await page.innerText("body")).slice(0, 5000);
      return { url, title, text };
    });

    await logToolReceipt({
      agentId, tool: "browser.navigate", target: url, authorized: true,
    }, actor);

    return { ok: true, ...result, durationMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start };
  }
}

export async function browserClick(url: string, selector: string, agentId: string, actor: string): Promise<BrowserResult> {
  const start = Date.now();
  try {
    const result = await withBrowser(async (page) => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await page.click(selector, { timeout: 5_000 });
      await page.waitForTimeout(1000);
      const title = await page.title();
      const text = (await page.innerText("body")).slice(0, 5000);
      return { url, title, text };
    });

    await logToolReceipt({
      agentId, tool: "browser.click", target: `${url}#${selector}`, authorized: true,
    }, actor);

    return { ok: true, ...result, durationMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start };
  }
}

export async function browserExtract(url: string, selector: string, agentId: string, actor: string): Promise<BrowserResult> {
  const start = Date.now();
  try {
    const result = await withBrowser(async (page) => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      const text = selector
        ? (await page.innerText(selector)).slice(0, 10000)
        : (await page.innerText("body")).slice(0, 10000);
      return { url, text };
    });

    await logToolReceipt({
      agentId, tool: "browser.extract", target: `${url}#${selector}`, authorized: true,
    }, actor);

    return { ok: true, ...result, durationMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start };
  }
}

export async function browserScreenshot(url: string, agentId: string, actor: string): Promise<BrowserResult> {
  const start = Date.now();
  try {
    const screenshot = await withBrowser(async (page) => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      return (await page.screenshot({ type: "png", fullPage: false })).toString("base64");
    });

    await logToolReceipt({
      agentId, tool: "browser.screenshot", target: url, authorized: true,
    }, actor);

    return { ok: true, url, screenshot, durationMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start };
  }
}
