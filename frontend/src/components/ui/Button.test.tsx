import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from './Button';

describe('Button', () => {
  it('renders the title', () => {
    render(<Button title="Click me" />);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('defaults to the primary variant', () => {
    render(<Button title="Go" />);
    expect(screen.getByRole('button')).toHaveClass('bg-primary-blue');
  });

  it('applies the outline variant', () => {
    render(<Button title="Go" variant="outline" />);
    expect(screen.getByRole('button')).toHaveClass('border-primary-blue');
  });

  it('applies the danger variant', () => {
    render(<Button title="Go" variant="danger" />);
    expect(screen.getByRole('button')).toHaveClass('border-semantic-error');
  });

  it('merges a custom className', () => {
    render(<Button title="Go" className="extra-class" />);
    expect(screen.getByRole('button')).toHaveClass('extra-class');
  });

  it('does not show a spinner by default', () => {
    render(<Button title="Go" />);
    expect(document.querySelector('svg')).not.toBeInTheDocument();
  });

  it('shows a spinner and disables the button when isLoading', () => {
    render(<Button title="Go" isLoading />);
    expect(document.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('respects the disabled prop', () => {
    render(<Button title="Go" disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('fires onClick when enabled', async () => {
    const onClick = jest.fn();
    render(<Button title="Go" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
