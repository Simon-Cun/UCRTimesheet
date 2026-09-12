import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { STORAGE_KEYS } from '@/utils/constants';

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: () => Promise.resolve(body),
});

const Probe = () => {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="initializing">{String(auth.isInitializing)}</span>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <span data-testid="username">{auth.username ?? 'none'}</span>
      <button onClick={() => auth.login('scun002', 'pw', true)}>login-remember</button>
      <button onClick={() => auth.login('scun002', 'pw', false)}>login-noremember</button>
      <button onClick={() => auth.importSession('12345', 'scun002')}>import</button>
      <button onClick={() => auth.logout()}>logout</button>
      <button onClick={() => auth.silentReAuth()}>reauth</button>
    </div>
  );
};

const renderAuth = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    global.fetch = jest.fn();
  });

  it('throws when useAuth is used outside a provider', () => {
    const BadProbe = () => {
      useAuth();
      return null;
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<BadProbe />)).toThrow('useAuth must be used inside AuthProvider');
    spy.mockRestore();
  });

  it('checks the session on mount and marks unauthenticated when none exists', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ isAuthenticated: false }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('initializing')).toHaveTextContent('false'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/session', { credentials: 'include' });
  });

  it('restores an authenticated session on mount', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ isAuthenticated: true, username: 'scun002' })
    );
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
    expect(screen.getByTestId('username')).toHaveTextContent('scun002');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.AUTH)!)).toEqual({
      isAuthenticated: true,
      username: 'scun002',
    });
  });

  it('clears stored auth when the session check reports unauthenticated', async () => {
    localStorage.setItem(
      STORAGE_KEYS.AUTH,
      JSON.stringify({ isAuthenticated: true, username: 'stale' })
    );
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ isAuthenticated: false }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'));
    expect(localStorage.getItem(STORAGE_KEYS.AUTH)).toBeNull();
  });

  it('swallows a network error from the session check', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network'));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('initializing')).toHaveTextContent('false'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  it('imports a session from URL params on mount', async () => {
    window.history.replaceState({}, '', '/?appCookie=999&username=scun002&cookies=abc');
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ success: true, username: 'scun002' })
    );
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/import-session',
      expect.objectContaining({ method: 'POST' })
    );
    expect(window.location.search).toBe('');
  });

  it('ignores a failed session import from URL params', async () => {
    window.history.replaceState({}, '', '/?appCookie=999&username=scun002');
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ success: false }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('initializing')).toHaveTextContent('false'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  it('swallows a network error during session import from URL params', async () => {
    window.history.replaceState({}, '', '/?appCookie=999&username=scun002');
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network'));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('initializing')).toHaveTextContent('false'));
  });

  it('logs in successfully and stores credentials when rememberMe is true', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ isAuthenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ success: true, username: 'scun002' }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('initializing')).toHaveTextContent('false'));

    await userEvent.click(screen.getByText('login-remember'));

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.CREDENTIALS)!)).toEqual({
      username: 'scun002',
      password: 'pw',
    });
  });

  it('logs in successfully and clears stored credentials when rememberMe is false', async () => {
    localStorage.setItem(
      STORAGE_KEYS.CREDENTIALS,
      JSON.stringify({ username: 'x', password: 'y' })
    );
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ isAuthenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ success: true, username: 'scun002' }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('initializing')).toHaveTextContent('false'));

    await userEvent.click(screen.getByText('login-noremember'));

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
    expect(localStorage.getItem(STORAGE_KEYS.CREDENTIALS)).toBeNull();
  });

  it('falls back to the given username when login response omits one', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ isAuthenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('initializing')).toHaveTextContent('false'));

    await userEvent.click(screen.getByText('login-remember'));

    await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('scun002'));
  });

  it('reports a failed login with a server-provided error', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ isAuthenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Bad creds' }, false, 401));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('initializing')).toHaveTextContent('false'));

    await userEvent.click(screen.getByText('login-remember'));

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  it('handles a network error during login', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ isAuthenticated: false }))
      .mockRejectedValueOnce(new Error('network'));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('initializing')).toHaveTextContent('false'));

    await userEvent.click(screen.getByText('login-remember'));

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  it('imports a session successfully via the importSession action', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ isAuthenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ success: true, username: 'scun002' }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('initializing')).toHaveTextContent('false'));

    await userEvent.click(screen.getByText('import'));

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
  });

  it('reports a failed importSession with a server-provided error', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ isAuthenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Bad cookie' }, false, 400));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('initializing')).toHaveTextContent('false'));

    await userEvent.click(screen.getByText('import'));

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  it('handles a network error during importSession', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ isAuthenticated: false }))
      .mockRejectedValueOnce(new Error('network'));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('initializing')).toHaveTextContent('false'));

    await userEvent.click(screen.getByText('import'));

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
  });

  it('logs out and clears storage even if the request fails', async () => {
    localStorage.setItem(
      STORAGE_KEYS.AUTH,
      JSON.stringify({ isAuthenticated: true, username: 'scun002' })
    );
    localStorage.setItem(
      STORAGE_KEYS.CREDENTIALS,
      JSON.stringify({ username: 'a', password: 'b' })
    );
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ isAuthenticated: true, username: 'scun002' }))
      .mockRejectedValueOnce(new Error('network'));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

    await userEvent.click(screen.getByText('logout'));

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'));
    expect(localStorage.getItem(STORAGE_KEYS.AUTH)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.CREDENTIALS)).toBeNull();
  });

  it('silentReAuth logs out and returns false when there are no stored credentials', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ isAuthenticated: true, username: 'scun002' }))
      .mockResolvedValueOnce(jsonResponse({}));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

    await userEvent.click(screen.getByText('reauth'));

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'));
  });

  it('silentReAuth logs back in with stored credentials on success', async () => {
    localStorage.setItem(
      STORAGE_KEYS.CREDENTIALS,
      JSON.stringify({ username: 'scun002', password: 'pw' })
    );
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ isAuthenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ success: true, username: 'scun002' }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('initializing')).toHaveTextContent('false'));

    await userEvent.click(screen.getByText('reauth'));

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
  });

  it('silentReAuth logs out when the re-login attempt fails', async () => {
    localStorage.setItem(
      STORAGE_KEYS.CREDENTIALS,
      JSON.stringify({ username: 'scun002', password: 'pw' })
    );
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ isAuthenticated: true, username: 'scun002' }))
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'nope' }, false, 401))
      .mockResolvedValueOnce(jsonResponse({}));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

    await userEvent.click(screen.getByText('reauth'));

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'));
  });

  it('ignores a redundant concurrent silentReAuth call while one is in flight', async () => {
    localStorage.setItem(
      STORAGE_KEYS.CREDENTIALS,
      JSON.stringify({ username: 'scun002', password: 'pw' })
    );
    let resolveLogin: (v: unknown) => void = () => {};
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ isAuthenticated: false }))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLogin = resolve;
          })
      );
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('initializing')).toHaveTextContent('false'));

    await act(async () => {
      screen.getByText('reauth').click();
      screen.getByText('reauth').click();
    });

    resolveLogin(jsonResponse({ success: true, username: 'scun002' }));
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
  });
});
