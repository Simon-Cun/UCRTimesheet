import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Switch from './Switch';

describe('Switch', () => {
  it('renders the label', () => {
    render(<Switch label="Remember me" value={false} onValueChange={jest.fn()} />);
    expect(screen.getByText('Remember me')).toBeInTheDocument();
  });

  it('reflects the checked state via aria-checked', () => {
    render(<Switch label="Remember me" value={true} onValueChange={jest.fn()} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onValueChange with the toggled value when clicked', async () => {
    const onValueChange = jest.fn();
    render(<Switch label="Remember me" value={false} onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('does not call onValueChange when disabled', async () => {
    const onValueChange = jest.fn();
    render(<Switch label="Remember me" value={false} onValueChange={onValueChange} disabled />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
