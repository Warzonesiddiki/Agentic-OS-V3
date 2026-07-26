/**
 * probe-harness.ts — periodic probe runner for subsystem liveness.
 *
 * Probes are lightweight checks (DB reachable, LLM gateway responsive, bus
 * connected). The harness runs them on an interval and reports results to the
 * health-monitor so ML-002 self-healing can act on degraded subsystems. Probe
 * results are ring-bounded (MAX_RESULTS) so history never leaks.
 */
import { log } from '../lib/logging.js';

export interface ProbeResult {
  probe: string;
  ok: boolean;
  status: 'ok' | 'degraded' | 'down' | 'fail';
  latencyMs: number;
  message: string;
  error?: string;
  at: number;
}

export type ProbeFn = () =>
  Promise<{ ok: boolean; message?: string }> | { ok: boolean; message?: string };

export interface Probe {
  name: string;
  run: ProbeFn;
  intervalMs: number;
}

const MAX_RESULTS = 256;

const _probes = new Map<string, Probe>();
const _results: ProbeResult[] = [];
const _timers = new Map<string, ReturnType<typeof setInterval>>();

export function registerProbe(probe: Probe | { id: string; fn: ProbeFn; intervalMs?: number }): void {
  const name = 'name' in probe ? probe.name : (probe as { id: string }).id;
  const run: ProbeFn = 'run' in probe ? probe.run : (probe as { fn: ProbeFn }).fn;
  const intervalMs = ('intervalMs' in probe ? probe.intervalMs : undefined) ?? 5000;
  _probes.set(name, { name, run, intervalMs });
}

export function unregisterProbe(name: string): void {
  _probes.delete(name);
  const t = _timers.get(name);
  if (t) clearInterval(t);
  _timers.delete(name);
}

async function executeProbe(name: string): Promise<ProbeResult> {
  const probe = _probes.get(name)!;
  const start = Date.now();
  try {
    const res = await probe.run();
    const result: ProbeResult = {
      probe: name,
      ok: res.ok,
      status: res.ok ? 'ok' : 'down',
      latencyMs: Date.now() - start,
      message: res.message ?? (res.ok ? 'ok' : 'failed'),
      at: Date.now(),
    };
    _results.push(result);
    if (_results.length > MAX_RESULTS) _results.shift();
    return result;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const result: ProbeResult = {
      probe: name,
      ok: false,
      status: 'fail',
      latencyMs: Date.now() - start,
      message: error,
      error,
      at: Date.now(),
    };
    _results.push(result);
    if (_results.length > MAX_RESULTS) _results.shift();
    return result;
  }
}

export async function runAllProbes(): Promise<ProbeResult[]> {
  const results = await Promise.all([..._probes.keys()].map(executeProbe));
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    log.warn('probe_harness_failures', {
      failed: failed.map((f) => f.probe),
    });
  }
  return results;
}

/** Start the interval loop for all registered probes. Returns a stop() fn. */
export function startProbeHarness(): () => void {
  for (const [name, probe] of _probes) {
    if (_timers.has(name)) continue;
    const t = setInterval(() => {
      void executeProbe(name).catch(() => undefined);
    }, probe.intervalMs);
    // Don't keep the event loop alive solely for probes.
    if (typeof t.unref === 'function') t.unref();
    _timers.set(name, t);
  }
  return stopProbeHarness;
}

export function stopProbeHarness(): void {
  for (const t of _timers.values()) clearInterval(t);
  _timers.clear();
}

export function getProbeResults(): ProbeResult[] {
  return [..._results];
}

// ── Legacy probe runner for metron tests ───────────────────────
let _probeLoopInterval: ReturnType<typeof setInterval> | null = null;

export async function runProbe(name: string): Promise<ProbeResult> {
  const probe = _probes.get(name);
  if (!probe) throw new Error(`Probe '${name}' not registered`);
  return executeProbe(name);
}

export function startProbeLoop(intervalMs: number): void {
  stopProbeLoop();
  _probeLoopInterval = setInterval(() => {
    void runAllProbes().catch(() => undefined);
  }, intervalMs);
  if (typeof _probeLoopInterval === 'object' && _probeLoopInterval !== null &&
      typeof (_probeLoopInterval as { unref?: () => void }).unref === 'function') {
    (_probeLoopInterval as { unref: () => void }).unref();
  }
}

export function stopProbeLoop(): void {
  if (_probeLoopInterval) { clearInterval(_probeLoopInterval); _probeLoopInterval = null; }
}
