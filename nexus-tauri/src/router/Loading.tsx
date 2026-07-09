import { type ReactElement } from 'react';

export interface LoadingProps {
  /** Accessible label describing what is loading. */
  label?: string;
}

/**
 * Shared loading fallback for Suspense boundaries and async UI.
 * Exposes an aria-live status region for screen readers.
 */
export function Loading({ label = 'Loading…' }: LoadingProps): ReactElement {
  return (
    <div className="nexus-loading" role="status" aria-live="polite">
      <span className="nexus-spinner" aria-hidden="true" />
      {label}
    </div>
  );
}
