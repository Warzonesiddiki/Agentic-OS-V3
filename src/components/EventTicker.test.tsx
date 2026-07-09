// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import EventTicker, { type AgentEvent } from './EventTicker';

function makeEvent(over: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: 'e1',
    kind: 'info',
    actor: 'agent-1',
    text: 'started a task',
    ts: Date.now(),
    ...over,
  };
}

describe('EventTicker', () => {
  it('renders an empty state when there are no events', () => {
    render(<EventTicker events={[]} />);
    expect(screen.getByText(/no events/i)).toBeInTheDocument();
  });

  it('renders a list of events with actor and text', () => {
    const events = [
      makeEvent({ id: 'a', actor: 'forge', text: 'booted kernel', kind: 'success' }),
      makeEvent({ id: 'b', actor: 'mnemosyne', text: 'recalled memory', kind: 'info' }),
    ];
    render(<EventTicker events={events} />);
    expect(screen.getByText('booted kernel')).toBeInTheDocument();
    expect(screen.getByText('recalled memory')).toBeInTheDocument();
    expect(screen.getByText('forge')).toBeInTheDocument();
    expect(screen.getByText('mnemosyne')).toBeInTheDocument();
  });

  it('renders the provided title', () => {
    render(<EventTicker events={[makeEvent()]} title="Mission Log" />);
    expect(screen.getByText('Mission Log')).toBeInTheDocument();
  });

  it('invokes onClear when the clear button is clicked', () => {
    const onClear = vi.fn();
    render(<EventTicker events={[makeEvent()]} onClear={onClear} />);
    const clearBtn = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('invokes onSelect when an event row is clicked', () => {
    const onSelect = vi.fn();
    const ev = makeEvent({ id: 'sel-1' });
    render(<EventTicker events={[ev]} onSelect={onSelect} />);
    const row = screen.getByText('started a task').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByText('started a task'));
    expect(onSelect).toHaveBeenCalledWith('sel-1');
  });

  it('renders a timestamp-relative label for each event', () => {
    const ev = makeEvent({ id: 'ts-1', ts: Date.now() - 5000 });
    render(<EventTicker events={[ev]} />);
    // timeAgo should produce a "s ago" style label
    expect(screen.getByText(/s ago|just now/i)).toBeInTheDocument();
  });
});
