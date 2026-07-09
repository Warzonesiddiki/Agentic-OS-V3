/**
 * performance/index.ts — Phase 15 barrel.
 * Re-exports the performance & scalability subsystem (15.1, 15.5, 15.6, 15.9, 15.11, 15.16,
 * 15.18, 15.21, 15.27, 15.33) so bootstrap/wiring can import from one place.
 */
export * from './response-cache.js';
export * from './redis-session.js';
export * from './slow-query-advisor.js';
export * from './chunked-transfer.js';
export * from './warmup-scheduler.js';
export * from './circuit-breaker-pool.js';
export * from './event-loop-lag.js';
export * from './graceful-drain.js';
export * from './registry.js';
export * from './bridge.js';
