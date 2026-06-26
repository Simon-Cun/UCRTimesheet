import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Switch from '@/components/ui/Switch';
import { useAuth } from '@/context/AuthContext';
import { STORAGE_KEYS } from '@/utils/constants';

const loadSavedUsername = (): string => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CREDENTIALS);
    if (raw) {
      const creds = JSON.parse(raw) as { username?: string };
      return creds.username ?? '';
    }
  } catch {
    // ignore
  }
  return '';
};

const LoginPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState(loadSavedUsername);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Import session fields
  const [importUsername, setImportUsername] = useState(loadSavedUsername);
  const [importAppCookie, setImportAppCookie] = useState('');

  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 300);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = await auth.login(username.trim(), password, rememberMe);

    if (result.success) {
      navigate('/', { replace: true });
    } else {
      triggerShake();
      setError(result.error ?? 'Invalid username or password');
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = await auth.importSession(
      importAppCookie.trim(),
      importUsername.trim()
    );

    if (result.success) {
      navigate('/', { replace: true });
    } else {
      triggerShake();
      setError(result.error ?? 'Failed to import session');
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left branding panel (desktop only) */}
      <div className="hidden lg:flex lg:w-2/5 xl:w-1/2 bg-gradient-to-b from-primary-blue-dark to-primary-blue flex-col items-center justify-center px-12 py-16">
        <div className="text-center animate-fade-slide-up">
          <h1 className="text-6xl font-bold text-primary-gold tracking-wide">Timesheet</h1>
          <p className="text-xl text-white/85 mt-4">UCR Automated</p>
          <p className="text-white/50 text-sm mt-8 leading-relaxed max-w-xs mx-auto">
            Submit your biweekly timesheet without touching the portal.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 bg-gradient-to-b from-primary-blue-dark to-primary-blue lg:bg-none lg:bg-neutral-gray100 flex flex-col items-center justify-center px-xl py-2xl">
        {/* Mobile-only branding */}
        <div className="lg:hidden text-center mb-2xl animate-fade-slide-up">
          <h1 className="text-4xl font-bold text-primary-gold tracking-wide">Timesheet</h1>
          <p className="text-lg text-white/90 mt-sm">UCR Automated</p>
        </div>

        <div className={`w-full max-w-sm animate-fade-slide-up ${shaking ? 'animate-shake' : ''}`}>
          {!showImport ? (
            <>
              <div className="hidden lg:block mb-lg">
                <h2 className="text-2xl font-bold text-neutral-gray800">Sign in</h2>
                <p className="text-sm text-neutral-gray500 mt-1">Use your UCR NetID credentials</p>
              </div>

              <Card variant="premium" className="p-xl">
                <form onSubmit={handleLogin} noValidate>
                  <Input
                    label="UCR NetID"
                    type="text"
                    placeholder="Enter your NetID"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    disabled={auth.isLoading}
                  />

                  <Input
                    label="Password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={auth.isLoading}
                  />

                  <div className="mt-sm mb-md">
                    <Switch
                      label="Remember me"
                      value={rememberMe}
                      onValueChange={setRememberMe}
                      disabled={auth.isLoading}
                    />
                  </div>

                  {error && (
                    <div className="bg-semantic-error-light px-md py-sm rounded-md mb-md">
                      <p className="text-semantic-error text-sm text-center" role="alert">
                        {error}
                      </p>
                    </div>
                  )}

                  <Button
                    title="Sign In"
                    type="submit"
                    isLoading={auth.isLoading}
                    disabled={!username.trim() || !password || auth.isLoading}
                  />
                </form>
              </Card>

              <p className="text-white/50 lg:text-neutral-gray500 text-xs mt-xl text-center">
                You'll need to approve a Duo push on your phone
              </p>

              <button
                onClick={() => { setShowImport(true); setError(null); }}
                className="block w-full text-center text-white/40 lg:text-neutral-gray400 text-xs mt-sm hover:text-white/70 lg:hover:text-neutral-gray600 transition-colors"
              >
                Import session from Playwright bot instead
              </button>
            </>
          ) : (
            <>
              <div className="hidden lg:block mb-lg">
                <h2 className="text-2xl font-bold text-neutral-gray800">Import session</h2>
                <p className="text-sm text-neutral-gray500 mt-1">Paste the values printed by the Playwright bot</p>
              </div>

              <Card variant="premium" className="p-xl">
                <form onSubmit={handleImport} noValidate>
                  <div className="mb-md p-sm rounded-md bg-neutral-gray100 lg:bg-neutral-gray50 border border-neutral-gray200 text-xs text-neutral-gray600 font-mono leading-relaxed">
                    <p className="font-sans font-semibold text-neutral-gray700 mb-xs">Run the bot first:</p>
                    <p>python timesheet_bot.py</p>
                    <p className="mt-xs text-neutral-gray400">Approve Duo, then copy "App Cookie" from its output.</p>
                  </div>

                  <Input
                    label="UCR NetID"
                    type="text"
                    placeholder="e.g. scun002"
                    value={importUsername}
                    onChange={(e) => setImportUsername(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    disabled={auth.isLoading}
                  />

                  <Input
                    label="App Cookie (session ID)"
                    type="text"
                    placeholder="e.g. 6317589"
                    value={importAppCookie}
                    onChange={(e) => setImportAppCookie(e.target.value)}
                    disabled={auth.isLoading}
                  />

                  {error && (
                    <div className="bg-semantic-error-light px-md py-sm rounded-md mb-md">
                      <p className="text-semantic-error text-sm text-center" role="alert">
                        {error}
                      </p>
                    </div>
                  )}

                  <Button
                    title="Import & Sign In"
                    type="submit"
                    isLoading={auth.isLoading}
                    disabled={!importUsername.trim() || !importAppCookie.trim() || auth.isLoading}
                  />
                </form>
              </Card>

              <button
                onClick={() => { setShowImport(false); setError(null); }}
                className="block w-full text-center text-white/40 lg:text-neutral-gray400 text-xs mt-xl hover:text-white/70 lg:hover:text-neutral-gray600 transition-colors"
              >
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
