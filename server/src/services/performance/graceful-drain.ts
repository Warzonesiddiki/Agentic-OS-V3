/**
 * graceful-drain.ts — Phase 15.18 graceful drain deploy coordinator.
 *
 * When a node is taken out of rotation (deploy/scale-down), it must stop accepting new work, wait
 * for in-flight requests to finish, then signal completion. The coordinator tracks in-flight
 * connection/request count and the drain deadline, and exposes readiness so a load balancer can
 * stop sending traffic the moment draining begins.
 */
import { log } from '../../lib/logging.js';

export type DrainState = 'active' | 'draining' | 'drained';

export class DrainCoordinator {
  private state: DrainState = 'active';
  private inFlight = 0;
  private drainingSince = 0;
  private readonly hardDeadlineMs: number;
  private onDrained: (() => void) | null = null;

  constructor(hardDeadlineMs = 30_000) {
    this.hardDeadlineMs = hardDeadlineMs;
  }

  getState(): DrainState {
    return this.state;
  }

  isDraining(): boolean {
    return this.state === 'draining';
  }

  isReady(): boolean {
    // A load balancer should route traffic only when active.
    return this.state === 'active';
  }

  beginDrain(cb?: () => void): void {
    if (this.state !== 'active') return;
    this.state = 'draining';
    this.drainingSince = Date.now();
    this.onDrained = cb ?? null;
    log.info('graceful-drain: begin');
    // Hard deadline: force-complete even if in-flight never drain.
    setTimeout(() => this.complete(), this.hardDeadlineMs);
  }

  /** Called by middleware when a request starts. */
  acquire(): boolean {
    if (this.state !== 'active') return false;
    this.inFlight++;
    return true;
  }

  /** Called by middleware when a request finishes. */
  release(): void {
    if (this.inFlight > 0) this.inFlight--;
    if (this.state === 'draining' && this.inFlight === 0) this.complete();
  }

  inFlightCount(): number {
    return this.inFlight;
  }

  private complete(): void {
    if (this.state === 'drained') return;
    this.state = 'drained';
    log.info('graceful-drain: complete', { inFlight: this.inFlight });
    const cb = this.onDrained;
    this.onDrained = null;
    cb?.();
  }

  /** Forcibly cancel a drain (e.g. deploy aborted / node kept). */
  cancel(): void {
    if (this.state === 'draining') {
      this.state = 'active';
      log.info('graceful-drain: cancelled');
    }
  }

  secondsRemaining(): number {
    if (this.state !== 'draining') return 0;
    return Math.max(0, Math.ceil((this.hardDeadlineMs - (Date.now() - this.drainingSince)) / 1000));
  }
}

export const drainCoordinator = new DrainCoordinator();
