import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Schedule } from '@/types/timesheet';
import { STORAGE_KEYS } from '@/utils/constants';

interface Settings {
  schedule: Schedule;
  rememberMe: boolean;
}

interface SettingsContextValue extends Settings {
  setSchedule: (s: Schedule) => void;
  setRememberMe: (v: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const EMPTY: Settings = { schedule: {}, rememberMe: true };

function loadLocal(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) return JSON.parse(raw) as Settings;
  } catch { /* ignore */ }
  return EMPTY;
}

function saveLocal(s: Settings) {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(s));
}

async function fetchRemote(): Promise<Schedule | null> {
  try {
    const res = await fetch('/api/schedule', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json() as { schedule: Schedule | null };
    return data.schedule;
  } catch { return null; }
}

async function pushRemote(schedule: Schedule) {
  try {
    await fetch('/api/schedule', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule }),
    });
  } catch { /* silent — localStorage is source of truth locally */ }
}

const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<Settings>(loadLocal);

  // On mount: pull from KV and prefer it if non-empty
  useEffect(() => {
    fetchRemote().then((remote) => {
      if (remote && Object.keys(remote).length > 0) {
        setSettings((s) => {
          const next = { ...s, schedule: remote };
          saveLocal(next);
          return next;
        });
      }
    });
  }, []);

  const setSchedule = useCallback((schedule: Schedule) => {
    setSettings((s) => {
      const next = { ...s, schedule };
      saveLocal(next);
      pushRemote(schedule);
      return next;
    });
  }, []);

  const setRememberMe = useCallback((rememberMe: boolean) => {
    setSettings((s) => {
      const next = { ...s, rememberMe };
      saveLocal(next);
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ ...settings, setSchedule, setRememberMe }}>
      {children}
    </SettingsContext.Provider>
  );
};

const useSettings = (): SettingsContextValue => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
};

export { SettingsProvider, useSettings };
