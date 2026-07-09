// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentDrawer, { type AgentNodeData } from './AgentDrawer';

function makeData(over: Partial<AgentNodeData> = {}): AgentNodeData {
  return {
    id: 'agent-7',
    name: 'Mnemosyne',
    role: 'Memory Engineer',
    status: 'idle',
    ring: 2,
    load: 0.1,
    task: undefined,
    ...over,
  };
}

describe('AgentDrawer', () => {
  it('renders the agent name and role in the drawer', () => {
    render(<AgentDrawer data={makeData()} />);
    expect(screen.getByText('Mnemosyne')).toBeInTheDocument();
    expect(screen.getByText('Memory Engineer')).toBeInTheDocument();
  });

  it('renders actionable tools (e.g. a tool list / buttons)', () => {
    render(<AgentDrawer data={makeData()} />);
    // The drawer exposes at least one interaction control.
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('invokes onClose when the close control is activated', () => {
    const onClose = vi.fn();
    render(<AgentDrawer data={makeData()} onClose={onClose} />);
    const closeBtn = screen.getByRole('button', { name: /close|✕|x/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reflects the agent status in the drawer', () => {
    render(<AgentDrawer data={makeData({ status: 'quarantined' })} />);
    expect(screen.getByText(/quarantined/i)).toBeInTheDocument();
  });
});
