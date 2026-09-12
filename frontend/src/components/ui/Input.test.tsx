import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Input from './Input';

describe('Input', () => {
  it('renders the label', () => {
    render(<Input label="Username" />);
    expect(screen.getByText('Username')).toBeInTheDocument();
  });

  it('derives an id from the label when none is given', () => {
    render(<Input label="UCR NetID" />);
    const input = screen.getByLabelText('UCR NetID');
    expect(input).toHaveAttribute('id', 'ucr-netid');
  });

  it('uses a provided id instead of deriving one', () => {
    render(<Input label="UCR NetID" id="custom-id" />);
    expect(screen.getByLabelText('UCR NetID')).toHaveAttribute('id', 'custom-id');
  });

  it('merges a custom className', () => {
    render(<Input label="Name" className="extra" />);
    expect(screen.getByLabelText('Name')).toHaveClass('extra');
  });

  it('forwards other input props and fires onChange', async () => {
    const onChange = jest.fn();
    render(<Input label="Name" placeholder="Enter name" onChange={onChange} />);
    const input = screen.getByPlaceholderText('Enter name');
    await userEvent.type(input, 'a');
    expect(onChange).toHaveBeenCalled();
  });
});
