import { useCallback, useState } from 'react';
import type { SaveLog, SaveResult, SaveStatus, Schedule } from '@/types/timesheet';
import { useAuth } from '@/context/AuthContext';

interface UseTimesheetReturn {
  status: SaveStatus;
  error: string | null;
  save: (schedule: Schedule) => Promise<SaveResult>;
  reset: () => void;
}

export function useTimesheet(): UseTimesheetReturn {
  const auth = useAuth();
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (schedule: Schedule): Promise<SaveResult> => {
      setStatus('saving');
      setError(null);

      try {
        const res = await fetch('/api/timesheet/save', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schedule }),
        });

        if (res.status === 401) {
          const reAuthed = await auth.silentReAuth();
          if (reAuthed) {
            return save(schedule);
          }
          setStatus('error');
          setError('Session expired. Please sign in again.');
          return { success: false, error: 'Session expired' };
        }

        const data = (await res.json()) as { success?: boolean; error?: string; message?: string; log?: SaveLog[] };

        if (!res.ok) {
          const msg = data.message ?? data.error ?? 'Save failed';
          setStatus('error');
          setError(msg);
          return { success: false, error: msg, log: data.log };
        }

        setStatus('success');
        return { success: true, log: data.log };
      } catch {
        setStatus('error');
        setError('Network error. Please try again.');
        return { success: false, error: 'Network error' };
      }
    },
    [auth]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return { status, error, save, reset };
}
