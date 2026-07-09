import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): JSX.Element {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <span>safe content</span>
      </ErrorBoundary>
    );
    expect(screen.getByText('safe content')).toBeInTheDocument();
  });

  it('catches render errors and shows the default fallback', () => {
    // Silence the expected React error boundary console output.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByText('kaboom')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders a custom fallback and can reset', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary
        fallback={(error, reset) => (
          <div role="alert">
            <span>custom: {error.message}</span>
            <button type="button" onClick={reset}>
              recover
            </button>
          </div>
        )}
      >
        <Boom />
      </ErrorBoundary>
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('custom: kaboom');
    expect(screen.getByText('recover')).toBeInTheDocument();
    spy.mockRestore();
  });
});
