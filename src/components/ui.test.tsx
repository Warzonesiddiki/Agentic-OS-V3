// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button, Badge, Card, SectionTitle, Input, Field, Select, CodeBlock } from './ui';

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('calls onClick handler when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Press</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>Press</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('supports aria-label for accessibility', () => {
    render(<Button aria-label="Close dialog">X</Button>);
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });

  it('defaults to type="button" (not submit)', () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('Badge', () => {
  it('renders text content', () => {
    render(<Badge>Stable</Badge>);
    expect(screen.getByText('Stable')).toBeInTheDocument();
  });

  it('supports different tones', () => {
    const { container } = render(<Badge tone="emerald">OK</Badge>);
    const badge = container.firstChild as HTMLElement;
    // The badge should exist and render content
    expect(screen.getByText('OK')).toBeInTheDocument();
  });
});

describe('Card', () => {
  it('renders children inside a card container', () => {
    render(<Card>Card content here</Card>);
    expect(screen.getByText('Card content here')).toBeInTheDocument();
  });

  it('accepts custom className', () => {
    const { container } = render(<Card className="custom-class">Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('custom-class');
  });
});

describe('SectionTitle', () => {
  it('renders title text', () => {
    render(<SectionTitle title="My Section" />);
    expect(screen.getByText('My Section')).toBeInTheDocument();
  });

  it('renders optional subtitle', () => {
    render(<SectionTitle title="Title" subtitle="Subtitle text" />);
    expect(screen.getByText('Subtitle text')).toBeInTheDocument();
  });

  it('renders without subtitle', () => {
    render(<SectionTitle title="Just Title" />);
    expect(screen.getByText('Just Title')).toBeInTheDocument();
  });

  it('renders optional icon', () => {
    render(<SectionTitle title="With Icon" icon={<span data-testid="icon">🔥</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders optional action', () => {
    render(<SectionTitle title="With Action" action={<button>Edit</button>} />);
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });
});

describe('Input', () => {
  it('renders an input element', () => {
    render(<Input aria-label="Search" />);
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeInTheDocument();
  });

  it('accepts a value', () => {
    render(<Input aria-label="Name" value="hello" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('hello');
  });

  it('calls onChange on input', () => {
    const onChange = vi.fn();
    render(<Input aria-label="Name" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe('Field', () => {
  it('renders label and children', () => {
    render(<Field label="Email"><input data-testid="input" /></Field>);
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByTestId('input')).toBeInTheDocument();
  });
});

describe('Select', () => {
  it('renders with options', () => {
    render(
      <Select aria-label="Color" value="red" onChange={() => {}}>
        <option value="red">Red</option>
        <option value="blue">Blue</option>
      </Select>
    );
    const select = screen.getByRole('combobox', { name: 'Color' });
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('red');
  });
});

describe('CodeBlock', () => {
  it('renders code content', () => {
    render(<CodeBlock>const x = 1;</CodeBlock>);
    expect(screen.getByText(/const x = 1;/)).toBeInTheDocument();
  });
});
