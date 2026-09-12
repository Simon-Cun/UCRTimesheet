import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import { useAuth } from '@/context/AuthContext';
import { STORAGE_KEYS } from '@/utils/constants';

jest.mock('@/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockUseAuth = useAuth as jest.Mock;

const renderPage = () =>
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockClear();
    mockUseAuth.mockReturnValue({ isLoading: false, login: jest.fn(), importSession: jest.fn() });
  });

  it('prefills the username from stored credentials', () => {
    localStorage.setItem(STORAGE_KEYS.CREDENTIALS, JSON.stringify({ username: 'scun002' }));
    renderPage();
    expect(screen.getByLabelText('UCR NetID')).toHaveValue('scun002');
  });

  it('leaves the username blank when stored credentials are malformed', () => {
    localStorage.setItem(STORAGE_KEYS.CREDENTIALS, '{bad json');
    renderPage();
    expect(screen.getByLabelText('UCR NetID')).toHaveValue('');
  });

  it('leaves the username blank when there is nothing stored', () => {
    renderPage();
    expect(screen.getByLabelText('UCR NetID')).toHaveValue('');
  });

  it('disables the sign-in button until both fields are filled', async () => {
    renderPage();
    const submit = screen.getByRole('button', { name: 'Sign In' });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('UCR NetID'), 'scun002');
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    expect(submit).toBeEnabled();
  });

  it('logs in and navigates home on success', async () => {
    const login = jest.fn().mockResolvedValue({ success: true });
    mockUseAuth.mockReturnValue({ isLoading: false, login, importSession: jest.fn() });
    renderPage();

    await userEvent.type(screen.getByLabelText('UCR NetID'), '  scun002  ');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(login).toHaveBeenCalledWith('scun002', 'secret', true);
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('toggles remember me off', async () => {
    const login = jest.fn().mockResolvedValue({ success: true });
    mockUseAuth.mockReturnValue({ isLoading: false, login, importSession: jest.fn() });
    renderPage();

    await userEvent.click(screen.getByRole('switch', { name: 'Remember me' }));
    await userEvent.type(screen.getByLabelText('UCR NetID'), 'scun002');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(login).toHaveBeenCalledWith('scun002', 'secret', false);
  });

  it('shows a server error and shakes on failed login', async () => {
    const login = jest.fn().mockResolvedValue({ success: false, error: 'Invalid password' });
    mockUseAuth.mockReturnValue({ isLoading: false, login, importSession: jest.fn() });
    renderPage();

    await userEvent.type(screen.getByLabelText('UCR NetID'), 'scun002');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid password');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows a default error message when login fails without one', async () => {
    const login = jest.fn().mockResolvedValue({ success: false });
    mockUseAuth.mockReturnValue({ isLoading: false, login, importSession: jest.fn() });
    renderPage();

    await userEvent.type(screen.getByLabelText('UCR NetID'), 'scun002');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password');
  });

  it('switches to the import-session form and back', async () => {
    renderPage();

    await userEvent.click(screen.getByText('Import session from Playwright bot instead'));
    expect(screen.getByText('Import & Sign In')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Back to sign in'));
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('imports a session and navigates home on success', async () => {
    const importSession = jest.fn().mockResolvedValue({ success: true });
    mockUseAuth.mockReturnValue({ isLoading: false, login: jest.fn(), importSession });
    renderPage();

    await userEvent.click(screen.getByText('Import session from Playwright bot instead'));
    await userEvent.type(screen.getByLabelText('UCR NetID'), '  scun002  ');
    await userEvent.type(screen.getByLabelText('App Cookie (session ID)'), '  12345  ');
    await userEvent.click(screen.getByRole('button', { name: 'Import & Sign In' }));

    expect(importSession).toHaveBeenCalledWith('12345', 'scun002');
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('shows an error and shakes on a failed import', async () => {
    const importSession = jest.fn().mockResolvedValue({ success: false, error: 'Bad cookie' });
    mockUseAuth.mockReturnValue({ isLoading: false, login: jest.fn(), importSession });
    renderPage();

    await userEvent.click(screen.getByText('Import session from Playwright bot instead'));
    await userEvent.type(screen.getByLabelText('UCR NetID'), 'scun002');
    await userEvent.type(screen.getByLabelText('App Cookie (session ID)'), '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Import & Sign In' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Bad cookie');
  });

  it('shows a default error message when import fails without one', async () => {
    const importSession = jest.fn().mockResolvedValue({ success: false });
    mockUseAuth.mockReturnValue({ isLoading: false, login: jest.fn(), importSession });
    renderPage();

    await userEvent.click(screen.getByText('Import session from Playwright bot instead'));
    await userEvent.type(screen.getByLabelText('UCR NetID'), 'scun002');
    await userEvent.type(screen.getByLabelText('App Cookie (session ID)'), '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Import & Sign In' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to import session');
  });

  it('disables inputs while loading', () => {
    mockUseAuth.mockReturnValue({ isLoading: true, login: jest.fn(), importSession: jest.fn() });
    renderPage();
    expect(screen.getByLabelText('UCR NetID')).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
  });
});
