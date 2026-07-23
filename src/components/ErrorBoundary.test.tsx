// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

// Helper component that throws on render
function Thrower({ message = 'Test error' }: { message?: string }) {
  throw new Error(message);
}

function GoodChild() {
  return <div data-testid="good-child">All good</div>;
}

describe('ErrorBoundary', () => {
  // Suppress React's error boundary console.error noise
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('good-child')).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('renders fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <Thrower message="Something broke badly" />
      </ErrorBoundary>
    );
    // The error boundary should show its fallback
    expect(screen.getByText('Something broke')).toBeInTheDocument();
    // The child should NOT be rendered
    expect(screen.queryByTestId('good-child')).not.toBeInTheDocument();
  });

  it('shows the error message in the fallback', () => {
    render(
      <ErrorBoundary>
        <Thrower message="Specific error message here" />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Specific error message here/)).toBeInTheDocument();
  });

  it('provides a "Try again" button to reset the boundary', () => {
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );
    const retryButton = screen.getByText('Try again');
    expect(retryButton).toBeInTheDocument();
  });

  it('has a "Reload page" option for unrecoverable errors', () => {
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );
    expect(screen.getByText(/reload/i)).toBeInTheDocument();
  });

  it('catches errors from deeply nested children', () => {
    render(
      <ErrorBoundary>
        <div>
          <div>
            <Thrower message="Deep error" />
          </div>
        </div>
      </ErrorBoundary>
    );
    expect(screen.getByText(/Deep error/)).toBeInTheDocument();
  });

  it('shows a warning icon in the fallback', () => {
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );
    // The ⚠ warning symbol
    expect(screen.getByText('⚠')).toBeInTheDocument();
  });

  it('assures the user their data is safe', () => {
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );
    expect(screen.getByText(/brain data is safe/i)).toBeInTheDocument();
  });
});
