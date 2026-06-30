import { useState, lazy, Suspense, ComponentType } from "react";
import { SkeletonLoader } from "./SkeletonLoader";
import { ErrorState } from "./ErrorState";

interface DynamicComponentProps {
  importFn: () => Promise<{ default: ComponentType<Record<string, unknown>> }>;
  fallback?: React.ReactNode;
  errorTitle?: string;
  props?: Record<string, unknown>;
}

export function DynamicComponent({
  importFn,
  fallback,
  errorTitle,
  props = {},
}: DynamicComponentProps) {
  const [retryKey, setRetryKey] = useState(0);
  const [hasError, setHasError] = useState(false);

  const LazyComponent = lazy(() =>
    importFn().catch(() => {
      setHasError(true);
      return { default: () => null };
    })
  );

  if (hasError) {
    return (
      <ErrorState
        title={errorTitle ?? "Failed to load component"}
        message="The module could not be loaded. It may have been removed or renamed."
        onRetry={() => { setHasError(false); setRetryKey((k) => k + 1); }}
      />
    );
  }

  return (
    <Suspense fallback={fallback ?? <SkeletonLoader variant="card" />}>
      <LazyComponent key={retryKey} {...props} />
    </Suspense>
  );
}
