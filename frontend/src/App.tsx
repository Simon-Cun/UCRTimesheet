import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { BrowserRouter } from 'react-router-dom';
import BottomNav from '@/components/layout/BottomNav';
import Sidebar from '@/components/layout/Sidebar';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SettingsProvider } from '@/context/SettingsContext';
import LoginPage from '@/pages/LoginPage';
import SettingsPage from '@/pages/SettingsPage';
import TimesheetPage from '@/pages/TimesheetPage';

const ProtectedLayout = () => {
  const auth = useAuth();

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="h-full flex">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden bg-primary-blue text-white px-lg py-md flex items-center justify-between shadow-md shrink-0">
          <h1 className="text-xl font-bold text-primary-gold tracking-wide">Timesheet</h1>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

        <div className="lg:hidden shrink-0">
          <BottomNav />
        </div>
      </div>
    </div>
  );
};

const AppRoutes = () => {
  const auth = useAuth();

  if (auth.isInitializing) return null;

  return (
    <Routes>
      <Route
        path="/login"
        element={auth.isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<TimesheetPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <SettingsProvider>
        <AppRoutes />
      </SettingsProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
