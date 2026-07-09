import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ReactNode, ReactElement } from "react";
import { cloneElement, isValidElement, useEffect, useId, useRef } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-nexus-border bg-nexus-panel/70 backdrop-blur-sm", className)}>{children}</div>
  );
}

export function SectionTitle({ title, subtitle, icon, action }: { title: string; subtitle?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        {icon && <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-nexus-border bg-slate-900/60 text-cyan-300">{icon}</div>}
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">{title}</h2>
          {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

type BtnVariant = "primary" | "ghost" | "danger" | "outline" | "subtle";
export function Button({
  children,
  onClick,
  variant = "subtle",
  className,
  type = "button",
  disabled,
  size = "md",
  "aria-label": ariaLabel,
  "aria-pressed": ariaPressed,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  size?: "sm" | "md";
  "aria-label"?: string;
  "aria-pressed"?: boolean;
}) {
  const variants: Record<BtnVariant, string> = {
    primary: "bg-cyan-500 text-slate-950 hover:bg-cyan-400 border border-cyan-400/50 shadow-lg shadow-cyan-500/20",
    danger: "bg-rose-600/90 text-white hover:bg-rose-500 border border-rose-500/50",
    ghost: "bg-transparent text-slate-300 hover:bg-slate-800/60 border border-transparent",
    outline: "bg-transparent text-slate-200 hover:bg-slate-800/60 border border-nexus-border",
    subtle: "bg-slate-800/70 text-slate-100 hover:bg-slate-700/70 border border-nexus-border",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = "slate", className }: { children: ReactNode; tone?: "slate" | "cyan" | "emerald" | "amber" | "rose" | "violet"; className?: string }) {
  const tones = {
    slate: "bg-slate-800/70 text-slate-300 border-slate-700",
    cyan: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
    emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    rose: "bg-rose-500/10 text-rose-300 border-rose-500/30",
    violet: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  };
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium", tones[tone], className)} aria-hidden={typeof children === "string" ? undefined : true}>
      {children}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded border border-slate-700 bg-slate-900/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">#{children}</span>;
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  const autoId = useId();
  const fieldId = htmlFor ?? autoId;
  const linked =
    isValidElement(children) && typeof children.props === "object"
      ? cloneElement(children as ReactElement<{ id?: string }>, {
          id: (children.props as { id?: string }).id ?? fieldId,
        })
      : children;
  return (
    <div className="block">
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={fieldId} className="text-xs font-medium text-slate-300">{label}</label>
        {hint && <span className="text-[10px] text-slate-500">{hint}</span>}
      </div>
      {linked}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-nexus-border bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const ariaLabel = props["aria-label"] ?? (props.id ? undefined : props.placeholder);
  return <input {...props} aria-label={ariaLabel} className={cn(inputCls, props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ariaLabel = props["aria-label"] ?? (props.id ? undefined : props.placeholder);
  return <textarea {...props} aria-label={ariaLabel} className={cn(inputCls, "resize-y font-mono text-xs leading-relaxed", props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputCls, "cursor-pointer", props.className)} />;
}

export function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <pre className={cn("overflow-x-auto rounded-lg border border-nexus-border bg-slate-950/80 p-3 font-mono text-[11px] leading-relaxed text-slate-300", className)}>
      {children}
    </pre>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-nexus-border py-12 text-center" role="status">
      <div className="text-sm font-medium text-slate-400">{title}</div>
      {hint && <div className="mt-1 text-xs text-slate-600">{hint}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone = "cyan" }: { label: string; value: ReactNode; sub?: string; tone?: "cyan" | "emerald" | "amber" | "violet" | "rose" }) {
  const ring = {
    cyan: "text-cyan-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    violet: "text-violet-300",
    rose: "text-rose-300",
  };
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn("mt-1 font-mono text-2xl font-semibold", ring[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </Card>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    const panel = panelRef.current;
    const getFocusable = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null)
        : [];
    const focusable = getFocusable();
    (focusable[0] ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const nodes = getFocusable();
        if (nodes.length === 0) {
          e.preventDefault();
          panel?.focus();
          return;
        }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn("nexus-fade relative z-10 max-h-[88vh] w-full overflow-auto rounded-xl border border-nexus-border bg-nexus-panel shadow-2xl outline-none", wide ? "max-w-3xl" : "max-w-lg")}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-nexus-border bg-nexus-panel/95 px-4 py-3 backdrop-blur">
          <h3 id={titleId} className="text-sm font-semibold text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
          >✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
