import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '@/context/AuthContext';

jest.mock('@/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;

describe('Sidebar', () => {
  it('shows the signed-in username', () => {
    mockUseAuth.mockReturnValue({ username: 'scun002' });
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText('scun002')).toBeInTheDocument();
  });

  it('falls back to an em dash when there is no username', () => {
    mockUseAuth.mockReturnValue({ username: null });
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('marks the active link based on the current route', () => {
    mockUseAuth.mockReturnValue({ username: 'scun002' });
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /settings/i })).toHaveClass('bg-white/15');
    expect(screen.getByRole('link', { name: /home/i })).toHaveClass('text-white/65');
  });
});
