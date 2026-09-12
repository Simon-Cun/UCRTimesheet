import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BottomNav from '@/components/layout/BottomNav';

describe('BottomNav', () => {
  it('renders Home and Settings links', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <BottomNav />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('marks the active link based on the current route', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <BottomNav />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /settings/i })).toHaveClass('text-primary-blue');
    expect(screen.getByRole('link', { name: /home/i })).toHaveClass('text-neutral-gray500');
  });
});
