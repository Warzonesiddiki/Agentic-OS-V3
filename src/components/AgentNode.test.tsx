// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentNode, type AgentNodeData } from './AgentNode';

const agent: AgentNodeData = {
  id: 'agent-1',
  name: 'Forge',
  status: 'executing_tool',
  ring: 0,
  kind: 'kernel',
  currentTool: 'scheduler',
  tokensUsed: 250,
  tokenBudget: 1000,
};

describe('AgentNode', () => {
  it('renders status, tool and ring details', () => {
    render(<AgentNode agent={agent} />);
    expect(screen.getByText('Forge')).toBeInTheDocument();
    expect(screen.getByText('Executing')).toBeInTheDocument();
    expect(screen.getByText(/scheduler/)).toBeInTheDocument();
    expect(screen.getByText(/R0/)).toBeInTheDocument();
  });

  it('invokes the selection callback', () => {
    const onClick = vi.fn();
    render(<AgentNode agent={agent} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
