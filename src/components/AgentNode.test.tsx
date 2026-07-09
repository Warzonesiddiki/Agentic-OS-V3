// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentNode, { type AgentNodeData, type AgentStatus } from './AgentNode';

function makeData(over: Partial<AgentNodeData> = {}): AgentNodeData {
  return {
    id: 'agent-1',
    name: 'Forge',
    role: 'Kernel Engineer',
    status: 'thinking' as AgentStatus,
    ring: 0,
    load: 0.4,
    task: 'compiling kernel',
    ...over,
  };
}

describe('AgentNode', () => {
  it('renders the agent name and role', () => {
    render(<AgentNode data={makeData()} />);
    expect(screen.getByText('Forge')).toBeInTheDocument();
    expect(screen.getByText('Kernel Engineer')).toBeInTheDocument();
  });

  it('renders a human-readable status label', () => {
    render(<AgentNode data={makeData({ status: 'executing_tool' })} />);
    expect(screen.getByText('executing tool')).toBeInTheDocument();
  });

  it('renders the current task when present', () => {
    render(<AgentNode data={makeData({ task: 'patching scheduler' })} />);
    expect(screen.getByText('patching scheduler')).toBeInTheDocument();
  });

  it('fires onSelect when the node is clicked', () => {
    const onSelect = vi.fn();
    render(<AgentNode data={makeData()} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Forge'));
    expect(onSelect).toHaveBeenCalledWith('agent-1');
  });

  it('fires onToggle when the toggle control is activated', () => {
    const onToggle = vi.fn();
    render(<AgentNode data={makeData()} onToggle={onToggle} />);
    const toggle = screen.getByRole('button', { name: /toggle|pause|resume/i });
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith('agent-1');
  });

  it('applies a data-status attribute for styling hooks', () => {
    const { container } = render(<AgentNode data={makeData({ status: 'errored' })} />);
    const node = container.firstChild as HTMLElement;
    expect(node.dataset.status).toBe('errored');
  });
});
