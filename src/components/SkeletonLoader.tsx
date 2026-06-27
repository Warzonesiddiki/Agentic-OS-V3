import { cn } from "./ui";

interface SkeletonLoaderProps {
  className?: string;
  lines?: number;
  variant?: "text" | "card" | "table-row";
}

export function SkeletonLoader({ className, lines = 3, variant = "text" }: SkeletonLoaderProps) {
  if (variant === "card") {
    return (
      <div className={cn("rounded-lg border border-nexus-border bg-nexus-panel p-4", className)}>
        <div className="mb-3 h-4 w-3/4 animate-pulse rounded bg-slate-700" />
        <div className="mb-2 h-3 w-full animate-pulse rounded bg-slate-700/50" />
        <div className="mb-2 h-3 w-5/6 animate-pulse rounded bg-slate-700/50" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-700/50" />
      </div>
    );
  }

  if (variant === "table-row") {
    return (
      <div className={cn("flex items-center gap-4 border-b border-nexus-border px-4 py-3", className)}>
        <div className="h-3 w-8 animate-pulse rounded bg-slate-700" />
        <div className="h-3 flex-1 animate-pulse rounded bg-slate-700/50" />
        <div className="h-3 w-20 animate-pulse rounded bg-slate-700/50" />
        <div className="h-3 w-16 animate-pulse rounded bg-slate-700/50" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-3 animate-pulse rounded bg-slate-700/50",
            i === lines - 1 ? "w-2/3" : "w-full",
          )}
        />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-7 w-48 animate-pulse rounded bg-slate-700" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonLoader key={i} variant="card" />
        ))}
      </div>
      <SkeletonLoader variant="table-row" />
      <SkeletonLoader variant="table-row" />
      <SkeletonLoader variant="table-row" />
    </div>
  );
}
