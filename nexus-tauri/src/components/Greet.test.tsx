import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Greet } from './Greet';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => invokeMock(cmd, args),
}));

describe('Greet', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while invoking the greet command', () => {
    invokeMock.mockReturnValue(new Promise<never>(() => undefined));
    render(<Greet name="Tess" />);
    expect(screen.getByText('Greeting…')).toBeInTheDocument();
  });

  it('renders the greeting message on success', async () => {
    invokeMock.mockResolvedValue("Hello, Tess! You've been greeted from Rust!");
    render(<Greet name="Tess" />);
    expect(
      await waitFor(() => screen.getByText(/Hello, Tess!/))
    ).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith('greet', { name: 'Tess' });
  });

  it('renders an error state when the command rejects', async () => {
    invokeMock.mockRejectedValueOnce(new Error('backend down'));
    render(<Greet name="Tess" />);
    const err = await waitFor(() => screen.getByText(/Error: backend down/));
    expect(err).toBeInTheDocument();
  });

  it('exposes an accessible labeled input', () => {
    invokeMock.mockResolvedValue('Hello, N!');
    render(<Greet name="N" />);
    const input = screen.getByLabelText('Name to greet');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('id');
  });
});
