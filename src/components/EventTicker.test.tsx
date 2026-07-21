// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventTicker, type TickerEvent } from './EventTicker';

const event: TickerEvent = {
  id: 'event-1',
  type: 'agent.state',
  label: 'Forge entered execution',
  timestamp: Date.now(),
};

describe('EventTicker', () => {
  it('renders nothing for an empty feed', () => {
    const { container } = render(<EventTicker events={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an accessible live event feed', () => {
    render(<EventTicker events={[event]} />);
    expect(screen.getByRole('log', { name: /live event feed/i })).toBeInTheDocument();
    expect(screen.getByText('Forge entered execution')).toBeInTheDocument();
  });
});
