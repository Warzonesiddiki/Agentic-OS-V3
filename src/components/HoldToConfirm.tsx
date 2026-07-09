import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { cn } from "./ui";

interface HoldToConfirmProps {
  onConfirm: () => void;
  label?: string;
  confirmLabel?: string;
  durationMs?: number;
  className?: string;
  disabled?: boolean;
}

export function HoldToConfirm({
  onConfirm,
  label = "Hold to confirm",
  confirmLabel = "Confirmed",
  durationMs = 1200,
  className,
  disabled,
}: HoldToConfirmProps) {
  const [holding, setHolding] = useState(false);
  const [completed, setCompleted] = useState(false);
  const progressRef = useRef(0);
  const frameRef = useRef<number>(0);
  const startRef = useRef(0);

  const reset = useCallback(() => {
    setHolding(false);
    setCompleted(false);
    progressRef.current = 0;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  const animate = useCallback(() => {
    const elapsed = Date.now() - startRef.current;
    progressRef.current = Math.min(1, elapsed / durationMs);

    if (progressRef.current >= 1) {
      setCompleted(true);
      setHolding(false);
      onConfirm();
      setTimeout(reset, 600);
      return;
    }

    frameRef.current = requestAnimationFrame(animate);
  }, [durationMs, onConfirm, reset]);

  const handleStart = useCallback(() => {
    if (disabled || completed) return;
    setHolding(true);
    startRef.current = Date.now();
    frameRef.current = requestAnimationFrame(animate);
  }, [disabled, completed, animate]);

  const handleEnd = useCallback(() => {
    if (!holding) return;
    reset();
  }, [holding, reset]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (disabled || completed) return;
        setCompleted(true);
        onConfirm();
        setTimeout(reset, 600);
      }
    },
    [disabled, completed, onConfirm, reset]
  );

  return (
    <button
      type="button"
      onMouseDown={handleStart}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      onTouchCancel={handleEnd}
      onKeyDown={handleKey}
      disabled={disabled}
      aria-label={completed ? confirmLabel : label + " — press Enter or Space to confirm"}
      aria-disabled={disabled || undefined}
      className={cn(
        "relative flex h-10 w-full items-center justify-center overflow-hidden rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70",
        completed
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
          : disabled
            ? "border-slate-700 bg-slate-900/50 text-slate-600 cursor-not-allowed"
            : "border-nexus-border bg-slate-800/70 text-slate-100 hover:bg-slate-700/70",
        className,
      )}
    >
      <span className={cn("relative z-10", completed && "animate-nexus-fade")}>
        {completed ? confirmLabel : holding ? "Release to cancel" : label}
      </span>
      {holding && (
        <span
          className="absolute bottom-0 left-0 h-0.5 bg-cyan-400 transition-none"
          style={{ width: `${progressRef.current * 100}%` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressRef.current * 100)}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
