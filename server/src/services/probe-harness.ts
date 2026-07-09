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
  status: 'ok' | 'degraded' | 'down';
  latencyMs: number;
  message: string;
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

export function registerProbe(probe: Probe): void {
  _probes.set(probe.name, probe);
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
    const result: ProbeResult = {
      probe: name,
      ok: false,
      status: 'down',
      latencyMs: Date.now() - start,
      message: e instanceof Error ? e.message : String(e),
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
