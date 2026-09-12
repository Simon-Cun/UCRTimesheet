import { render, screen } from '@testing-library/react';
import Card from './Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Hello</Card>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('applies default variant classes', () => {
    render(<Card>Hello</Card>);
    expect(screen.getByText('Hello')).toHaveClass('bg-white');
  });

  it('applies premium variant classes', () => {
    render(<Card variant="premium">Hello</Card>);
    expect(screen.getByText('Hello')).toHaveClass('border-neutral-gray200');
  });

  it('merges a custom className', () => {
    render(<Card className="extra">Hello</Card>);
    expect(screen.getByText('Hello')).toHaveClass('extra');
  });
});
