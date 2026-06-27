import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — prevents a single render fault from white-screening the app.
 * Surfaces the error with a recovery path (reload) instead of a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to console (and could be wired to observability in a server port).
    console.error("[NEXUS] render error:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-nexus-bg p-8">
          <div className="w-full max-w-lg rounded-xl border border-rose-500/30 bg-nexus-panel p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300">⚠</div>
              <div>
                <h1 className="text-lg font-semibold text-slate-100">Something broke</h1>
                <p className="text-sm text-slate-400">A render error was caught. Your brain data is safe.</p>
              </div>
            </div>
            <pre className="mt-4 max-h-48 overflow-auto rounded-lg border border-nexus-border bg-slate-950/80 p-3 font-mono text-[11px] text-rose-300">
              {this.state.error?.message ?? "Unknown error"}
            </pre>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="rounded-lg border border-nexus-border bg-slate-800/70 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700/70"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg border border-cyan-400/50 bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400"
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
