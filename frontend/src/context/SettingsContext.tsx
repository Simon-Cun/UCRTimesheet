import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Schedule } from '@/types/timesheet';
import { STORAGE_KEYS } from '@/utils/constants';

interface Settings {
  schedules: Schedule[];   // indexed by job (0 = Job 1, 1 = Job 2, ...)
  jobLabels: string[];     // e.g. ['TUT-NON GSHIP', 'READER-NON GSHIP']
  rememberMe: boolean;
}

interface SettingsContextValue extends Settings {
  schedule: Schedule;                                     // alias for schedules[0]
  setSchedule: (s: Schedule) => void;                     // alias for setJobSchedule(0, s)
  setJobSchedule: (idx: number, s: Schedule) => void;
  setJobLabels: (labels: string[]) => void;
  setRememberMe: (v: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const EMPTY: Settings = { schedules: [{}], jobLabels: [], rememberMe: true };

function loadLocal(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings & { schedule: Schedule }>;
      // Migrate from old single-schedule format
      if (parsed.schedules) return parsed as Settings;
      if (parsed.schedule) return { ...EMPTY, ...parsed, schedules: [parsed.schedule], jobLabels: parsed.jobLabels ?? [] };
    }
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
  } catch { /* silent */ }
}

const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<Settings>(loadLocal);

  useEffect(() => {
    fetchRemote().then((remote) => {
      if (remote && Object.keys(remote).length > 0) {
        setSettings((s) => {
          const next = { ...s, schedules: [remote, ...s.schedules.slice(1)] };
          saveLocal(next);
          return next;
        });
      }
    });
  }, []);

  const setJobSchedule = useCallback((idx: number, schedule: Schedule) => {
    setSettings((s) => {
      const schedules = [...s.schedules];
      while (schedules.length <= idx) schedules.push({});
      schedules[idx] = schedule;
      const next = { ...s, schedules };
      saveLocal(next);
      if (idx === 0) pushRemote(schedule);
      return next;
    });
  }, []);

  const setSchedule = useCallback((s: Schedule) => setJobSchedule(0, s), [setJobSchedule]);

  const setJobLabels = useCallback((jobLabels: string[]) => {
    setSettings((s) => {
      const next = { ...s, jobLabels };
      saveLocal(next);
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

  const value: SettingsContextValue = {
    ...settings,
    schedule: settings.schedules[0] ?? {},
    setSchedule,
    setJobSchedule,
    setJobLabels,
    setRememberMe,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

const useSettings = (): SettingsContextValue => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
};

export { SettingsProvider, useSettings };
