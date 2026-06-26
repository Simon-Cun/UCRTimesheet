import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const TimesheetIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="14" x2="16" y2="14" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const Sidebar = () => {
  const auth = useAuth();

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center gap-3 px-4 py-3 rounded-lg mx-3 text-sm font-medium transition-all duration-150',
      isActive ? 'bg-white/15 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white',
    ].join(' ');

  return (
    <aside className="w-60 bg-primary-blue flex flex-col shrink-0 h-full">
      <div className="px-6 py-7 border-b border-white/10">
        <h1 className="text-2xl font-bold text-primary-gold tracking-wide">Timesheet</h1>
        <p className="text-white/55 text-xs mt-1">UCR Automated</p>
      </div>

      <nav className="flex-1 py-4 flex flex-col gap-1">
        <NavLink to="/" end className={navLinkClass}>
          <TimesheetIcon />
          Home
        </NavLink>
        <NavLink to="/settings" className={navLinkClass}>
          <SettingsIcon />
          Settings
        </NavLink>
      </nav>

      <div className="px-6 py-5 border-t border-white/10">
        <p className="text-white/45 text-xs mb-1">Signed in as</p>
        <p className="text-white text-sm font-semibold truncate">{auth.username ?? '—'}</p>
      </div>
    </aside>
  );
};

export default Sidebar;
