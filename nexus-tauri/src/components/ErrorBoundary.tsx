import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

export interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors in the descendant tree so a single component
 * failure does not blank the whole desktop shell.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the error for diagnostics without crashing the app.
    console.error('[NexusTauri] ErrorBoundary caught:', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;
    if (error) {
      if (fallback) {
        return fallback(error, this.reset);
      }
      return (
        <div role="alert" className="nexus-error">
          <h2>Something went wrong</h2>
          <pre>{error.message}</pre>
          <button type="button" onClick={this.reset}>
            Try again
          </button>
        </div>
      );
    }
    return children;
  }
}
