import type { Schedule } from '@/types/timesheet';

export const STORAGE_KEYS = {
  AUTH: 'ts_auth',
  CREDENTIALS: 'ts_credentials',
  SETTINGS: 'ts_settings',
} as const;

export const DEFAULT_SCHEDULE: Schedule = {};
