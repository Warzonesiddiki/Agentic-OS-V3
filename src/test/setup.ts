/**
 * Test environment shim for the NEXUS frontend store suite.
 *
 * The frontend stores (store.ts / osStore.ts / engine.ts / remote.ts) persist to
 * `localStorage` and read `window.location`. vitest's node environment provides
 * neither, and we cannot install jsdom/happy-dom in this runtime. So we supply a
 * dependency-free in-memory shim for the few browser globals the stores touch.
 * This keeps the test run green without pulling a DOM testing library.
 *
 * Registered as the vitest setup file in vitest.config.ts. In the jsdom
 * environment (component tests) the browser globals already exist, so the shim
 * below is skipped; this import additionally registers the jest-dom matchers
 * used by the React Testing Library component tests.
 */
import '@testing-library/jest-dom/vitest';

class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
}

if (typeof (globalThis as { localStorage?: unknown }).localStorage === 'undefined') {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
}

if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
  // Make `window` point at globalThis so `typeof window !== 'undefined'` checks pass,
  // and provide the minimal surface the stores read (window.location.origin, NEXUS_API_PORT).
  (globalThis as { window?: unknown }).window = globalThis;
  (globalThis as unknown as { location: { origin: string } }).location = { origin: '' };
}

if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  (globalThis as { document?: unknown }).document = {
    visibilityState: 'visible',
    addEventListener: (type: string, fn: (...args: unknown[]) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(fn);
    },
    removeEventListener: (type: string, fn: (...args: unknown[]) => void) => {
      listeners.get(type)?.delete(fn);
    },
  };
}
