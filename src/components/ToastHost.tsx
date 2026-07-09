/**
 * ToastHost — renders active toasts and provides a dismiss control.
 * Mounted once in App.tsx so every page can call toast.success(...) etc.
 */
import { dismissToast, getToasts, subscribeToasts, type ToastTone } from "../lib/toast";
import { cn } from "./ui";

const TONE: Record<ToastTone, string> = {
  info: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-200",
};

import { useSyncExternalStore } from "react";

export function ToastHost() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center" role="region" aria-label="Notifications">
      <div className="pointer-events-auto flex max-w-md flex-col gap-2 px-4" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "flex items-start gap-3 rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur-sm",
              TONE[t.tone]
            )}
          >
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismissToast(t.id)}
              className="text-current opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 rounded"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
