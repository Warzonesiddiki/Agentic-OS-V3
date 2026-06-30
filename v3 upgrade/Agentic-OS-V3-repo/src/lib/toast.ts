/**
 * toast.ts — in-app toast notification system.
 *
 * Replaces alert()/confirm() with non-blocking UI feedback.
 *
 * CRITICAL: `getToasts()` is the snapshot getter for `useSyncExternalStore`.
 * React calls it during render. It MUST be a pure read — no mutations, no
 * emit(). If it triggers a re-render (via emit), React throws #185
 * (Maximum update depth exceeded). Expiration is handled OUTSIDE the
 * snapshot getter via setTimeout-based dismissal.
 */
export type ToastTone = "info" | "success" | "warning" | "danger";

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  ttl: number;
  createdAt: number;
}

const listeners = new Set<() => void>();
let toasts: Toast[] = [];

/**
 * The cached snapshot returned to useSyncExternalStore. Must be a stable
 * reference when the underlying data hasn't changed (React's getSnapshot
 * contract). Only replaced when showToast/dismissToast mutate `toasts`.
 */
let snapshot: Toast[] = [];

function rebuildSnapshot(): void {
  snapshot = toasts;
}

function emit(): void {
  for (const fn of listeners) fn();
}

/** PURE snapshot getter — no mutations, no emit(). Safe during React render. */
export function getToasts(): Toast[] {
  return snapshot;
}

export function subscribeToasts(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function showToast(message: string, tone: ToastTone = "info", ttl = 4000): string {
  const id = `tst_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  toasts = [...toasts, { id, tone, message, ttl, createdAt: Date.now() }];
  rebuildSnapshot();
  emit();
  // Auto-dismiss after TTL — handles expiration OUTSIDE the render cycle.
  if (ttl > 0) {
    setTimeout(() => dismissToast(id), ttl);
  }
  return id;
}

export function dismissToast(id: string): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return; // nothing changed
  toasts = next;
  rebuildSnapshot();
  emit();
}

export const toast = {
  info: (m: string, ttl?: number) => showToast(m, "info", ttl),
  success: (m: string, ttl?: number) => showToast(m, "success", ttl),
  warning: (m: string, ttl?: number) => showToast(m, "warning", ttl),
  danger: (m: string, ttl?: number) => showToast(m, "danger", ttl),
  confirm: (message: string): boolean => window.confirm(message),
};
