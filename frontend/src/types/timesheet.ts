export type AMPM = 'am' | 'pm';

export interface TimeEntry {
  timeIn: string;
  ampmIn: AMPM;
  timeOut: string;
  ampmOut: AMPM;
}

export type Schedule = Record<string, TimeEntry[]>;

export type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

export interface SaveLog {
  day: string;
  nDate: string;
  status: 'ok' | 'error';
  message?: string;
}

export interface SaveResult {
  success: boolean;
  error?: string;
  log?: SaveLog[];
}

export const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];
