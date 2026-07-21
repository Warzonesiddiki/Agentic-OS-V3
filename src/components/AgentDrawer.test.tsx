// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentDrawer } from './AgentDrawer';
import type { AgentNodeData } from './AgentNode';

const agent: AgentNodeData = {
  id: 'agent-7',
  name: 'Mnemosyne',
  status: 'quarantined',
  ring: 2,
  kind: 'memory',
  llmModel: 'local-model',
};

describe('AgentDrawer', () => {
  it('renders nothing without a selected agent', () => {
    const { container } = render(<AgentDrawer agent={null} onClose={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders agent details and closes from its accessible control', () => {
    const onClose = vi.fn();
    render(<AgentDrawer agent={agent} onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Mnemosyne')).toBeInTheDocument();
    expect(screen.getByText('quarantined')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close agent details/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
