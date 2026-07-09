import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './ErrorState';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[NEXUS Page] render error:', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-rose-500/30 bg-nexus-panel/70 p-6 backdrop-blur-sm">
          <ErrorState
            title="Page failed to render"
            message={this.state.error?.message ?? 'An unexpected error occurred.'}
            onRetry={() => this.setState({ hasError: false, error: null })}
            variant="inline"
          />
        </div>
      );
    }
    return this.props.children;
  }
}
