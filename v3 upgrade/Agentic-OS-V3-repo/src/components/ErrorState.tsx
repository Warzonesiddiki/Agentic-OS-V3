import { cn } from "./ui";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  variant?: "inline" | "full-page";
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  variant = "inline",
  className,
}: ErrorStateProps) {
  const content = (
    <div className={cn(
      "flex flex-col items-center justify-center gap-3 text-center",
      variant === "full-page" ? "min-h-[60vh]" : "py-8",
      className,
    )}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10">
        <svg className="h-6 w-6 text-rose-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <div>
        <h3 className="text-sm font-medium text-slate-200">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-md border border-nexus-border bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700/70"
        >
          Try again
        </button>
      )}
    </div>
  );

  return content;
}

export function ApiErrorState({ status, message, onRetry }: { status?: number; message: string; onRetry?: () => void }) {
  return (
    <ErrorState
      title={status ? `Error ${status}` : "Request failed"}
      message={message}
      onRetry={onRetry}
    />
  );
}
