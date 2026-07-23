// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { KillSwitchBanner } from './KillSwitchBanner';

// Mock the remote module
vi.mock('../lib/remote', () => {
  let callback: ((info: { message: string; path: string }) => void) | null = null;
  return {
    onKillSwitch: (cb: (info: { message: string; path: string }) => void) => {
      callback = cb;
      return () => { callback = null; };
    },
    __triggerKillSwitch: (info: { message: string; path: string }) => {
      callback?.(info);
    },
  };
});

// Get the trigger function from the mock
const { __triggerKillSwitch } = await import('../lib/remote');

describe('KillSwitchBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when kill switch is not active', () => {
    const { container } = render(<KillSwitchBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('shows banner when kill switch is triggered', () => {
    render(<KillSwitchBanner />);

    act(() => {
      __triggerKillSwitch({ message: 'System locked', path: '/api/v1/memories' });
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('kill switch')).toBeInTheDocument();
    expect(screen.getByText('System locked')).toBeInTheDocument();
    expect(screen.getByText('/api/v1/memories')).toBeInTheDocument();
  });

  it('can be dismissed', () => {
    render(<KillSwitchBanner />);

    act(() => {
      __triggerKillSwitch({ message: 'Locked', path: '/test' });
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByText('dismiss'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('auto-clears after 8 seconds', () => {
    render(<KillSwitchBanner />);

    act(() => {
      __triggerKillSwitch({ message: 'Locked', path: '/test' });
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('resets timer on subsequent triggers', () => {
    render(<KillSwitchBanner />);

    act(() => {
      __triggerKillSwitch({ message: 'First', path: '/a' });
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    act(() => {
      __triggerKillSwitch({ message: 'Second', path: '/b' });
    });

    // After 5 more seconds (total 10s from first), should still be visible
    // because second trigger reset the timer
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();

    // After 3 more seconds (8s from second trigger), should clear
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
