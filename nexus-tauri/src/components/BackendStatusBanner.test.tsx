import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendStatusBanner } from './BackendStatusBanner';

// Mock the Tauri core bridge. We control resolve/reject per test.
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => invokeMock(cmd, args),
}));

describe('BackendStatusBanner', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the backend is not ready', () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'is_backend_ready') return false;
      // Never resolves ready, so we stay in loading.
      return new Promise<never>(() => undefined);
    });

    render(<BackendStatusBanner pollMs={10} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Connecting to Nexus backend');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('shows the ready state once the backend reports a port', async () => {
    invokeMock
      .mockResolvedValueOnce(true) // is_backend_ready
      .mockResolvedValueOnce(9900); // get_backend_port

    render(<BackendStatusBanner pollMs={10} />);

    const status = await waitFor(() =>
      screen.getByText(/Nexus backend ready on port 9900/)
    );
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(invokeMock).toHaveBeenCalledWith('is_backend_ready');
    expect(invokeMock).toHaveBeenCalledWith('get_backend_port');
  });

  it('shows an error state when the command rejects', async () => {
    invokeMock.mockRejectedValueOnce(new Error('port file missing'));

    render(<BackendStatusBanner pollMs={10} />);

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert).toHaveTextContent('Backend error: port file missing');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });
});
