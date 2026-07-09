// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Console, { type LogLine } from './Console';

function makeLine(over: Partial<LogLine> = {}): LogLine {
  return {
    id: 'l1',
    ts: Date.now(),
    level: 'info',
    text: 'system online',
    ...over,
  };
}

describe('Console', () => {
  it('renders provided title', () => {
    render(<Console lines={[]} title="Operator Console" />);
    expect(screen.getByText('Operator Console')).toBeInTheDocument();
  });

  it('renders log lines with their text', () => {
    const lines = [
      makeLine({ id: '1', text: 'boot complete' }),
      makeLine({ id: '2', text: 'agent spawned' }),
    ];
    render(<Console lines={lines} />);
    expect(screen.getByText('boot complete')).toBeInTheDocument();
    expect(screen.getByText('agent spawned')).toBeInTheDocument();
  });

  it('shows an empty hint when there are no lines', () => {
    render(<Console lines={[]} />);
    expect(screen.getByText(/no output/i)).toBeInTheDocument();
  });

  it('submits a command through onCommand on Enter', () => {
    const onCommand = vi.fn();
    render(<Console lines={[]} onCommand={onCommand} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'status' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith('status');
  });

  it('clears the input after submitting a command', () => {
    const onCommand = vi.fn();
    render(<Console lines={[]} onCommand={onCommand} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'help' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
  });

  it('does not submit an empty command', () => {
    const onCommand = vi.fn();
    render(<Console lines={[]} onCommand={onCommand} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('renders a busy indicator when busy is true', () => {
    render(<Console lines={[]} busy />);
    expect(screen.getByText(/working|busy|…|\.\.\./i)).toBeInTheDocument();
  });
});
