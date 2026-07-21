// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Console from './Console';

describe('Console', () => {
  it('renders the API perimeter controls', () => {
    render(<Console />);
    expect(screen.getByText('API console')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send request/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Method')).toHaveValue('GET');
    expect(screen.getByLabelText('Path')).toHaveValue('/api/v1/health');
  });

  it('applies request presets', () => {
    render(<Console />);
    fireEvent.click(screen.getByRole('button', { name: /post \/memories/i }));
    expect(screen.getByLabelText('Method')).toHaveValue('POST');
    expect(screen.getByLabelText('Path')).toHaveValue('/api/v1/memories');
    expect((screen.getByLabelText(/request body/i) as HTMLTextAreaElement).value).toContain(
      'Console-created memory',
    );
  });
});
