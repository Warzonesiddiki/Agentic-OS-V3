import { Component, type ErrorInfo, type ReactNode } from "react";

interface SectionErrorBoundaryProps {
  children: ReactNode;
  /** Human-readable label for the section, shown in the fallback. */
  sectionName?: string;
  /** Optional custom fallback renderer. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /**
   * Keys that, when changed (e.g. a query refetch id), automatically reset the
   * boundary so a previously-errored section retries. Defaults to [].
   */
  resetKeys?: ReadonlyArray<unknown>;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * SectionErrorBoundary — a finer-grained, retryable error boundary for async
 * widgets (data grids, panels). Unlike the route-level PageErrorBoundary, this
 * isolates a single failing section so the rest of the page stays interactive.
 * A "Retry" action resets the boundary without reloading the whole app.
 */
export class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[NEXUS] section error${this.props.sectionName ? ` (${this.props.sectionName})` : ""}:`,
      error,
      info.componentStack
    );
  }

  componentDidUpdate(prev: SectionErrorBoundaryProps): void {
    if (
      this.state.hasError &&
      this.props.resetKeys &&
      prev.resetKeys &&
      !shallowEqual(this.props.resetKeys, prev.resetKeys)
    ) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error as Error, this.reset);
      }
      const name = this.props.sectionName ?? "This section";
      return (
        <div
          role="alert"
          className="my-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300">
              ⚠
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-rose-200">
                {name} failed to load
              </p>
              <p className="mt-1 break-words font-mono text-[11px] text-rose-300/80">
                {(this.state.error as Error | null)?.message ?? "Unknown error"}
              </p>
              <button
                type="button"
                onClick={this.reset}
                className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-500/30"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function shallowEqual(a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}
