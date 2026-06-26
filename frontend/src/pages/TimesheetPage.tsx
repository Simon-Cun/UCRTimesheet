import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useTimesheet } from '@/hooks/useTimesheet';
import { DAYS_OF_WEEK, type TimeEntry } from '@/types/timesheet';

interface DayRow {
  dayName: string;
  nDate: string;
  isHoliday: string;
  hoursDisplay: string;
  dateLabel: string;
}

interface CurrentTimesheet {
  periodLabel: string;
  dayRows: DayRow[];
}

interface EditState {
  nDate: string;
  entries: TimeEntry[];
  loading: boolean;
  saving: boolean;
}

const AMPM_OPTIONS = ['am', 'pm'] as const;
const BLANK: TimeEntry = { timeIn: '', ampmIn: 'pm', timeOut: '', ampmOut: 'pm' };

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);
const PencilIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

function useRelativeTime(date: Date | null): string {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!date) { setLabel(''); return; }
    const update = () => {
      const secs = Math.floor((Date.now() - date.getTime()) / 1000);
      if (secs < 10)        setLabel('Refreshed just now');
      else if (secs < 60)   setLabel(`Refreshed ${secs}s ago`);
      else if (secs < 3600) setLabel(`Refreshed ${Math.floor(secs / 60)}m ago`);
      else                   setLabel(`Refreshed ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    };
    update();
    const id = setInterval(update, 15_000);
    return () => clearInterval(id);
  }, [date]);
  return label;
}

const TimesheetPage = () => {
  const auth = useAuth();
  const settings = useSettings();
  const { status, error, save, reset } = useTimesheet();
  const [current, setCurrent] = useState<CurrentTimesheet | null>(null);
  const [currentLoading, setCurrentLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const refreshLabel = useRelativeTime(lastRefreshed);

  const activeDays = DAYS_OF_WEEK.filter((d) => settings.schedule[d]?.length > 0);

  const fetchCurrent = async () => {
    setCurrentLoading(true);
    try {
      const res = await fetch('/api/timesheet/current', { credentials: 'include' });
      if (res.ok) {
        setCurrent(await res.json() as CurrentTimesheet);
        setLastRefreshed(new Date());
      }
    } catch { /* silent */ }
    finally { setCurrentLoading(false); }
  };

  useEffect(() => { fetchCurrent(); }, []);

  const handleSave = async () => {
    reset();
    const result = await save(settings.schedule);
    if (result.success) fetchCurrent();
  };

  const startEdit = async (row: DayRow) => {
    setEdit({ nDate: row.nDate, entries: [], loading: true, saving: false });
    try {
      const res = await fetch(`/api/timesheet/day?nDate=${row.nDate}`, { credentials: 'include' });
      const data = await res.json() as { entries: TimeEntry[] };
      setEdit((e) => e ? { ...e, entries: data.entries.length > 0 ? data.entries : [{ ...BLANK }], loading: false } : null);
    } catch {
      setEdit((e) => e ? { ...e, entries: [{ ...BLANK }], loading: false } : null);
    }
  };

  const cancelEdit = () => setEdit(null);

  const saveEdit = async () => {
    if (!edit) return;
    setEdit((e) => e ? { ...e, saving: true } : null);
    try {
      await fetch('/api/timesheet/day', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nDate: edit.nDate, entries: edit.entries }),
      });
      setEdit(null);
      fetchCurrent();
    } catch {
      setEdit((e) => e ? { ...e, saving: false } : null);
    }
  };

  const clearDay = async (nDate: string) => {
    await fetch('/api/timesheet/day', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nDate, entries: [] }),
    });
    fetchCurrent();
  };

  const clearAll = async () => {
    if (!current) return;
    const filled = current.dayRows.filter((r) => r.hoursDisplay);
    if (filled.length === 0) return;
    setClearingAll(true);
    await Promise.all(
      filled.map((r) =>
        fetch('/api/timesheet/day', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nDate: r.nDate, entries: [] }),
        })
      )
    );
    setClearingAll(false);
    fetchCurrent();
  };

  const inputClass = 'border border-neutral-gray200 rounded-md px-sm py-xs text-sm text-neutral-gray800 focus:outline-none focus:border-primary-blue focus:ring-1 focus:ring-primary-blue';

  return (
    <div className="flex-1 bg-neutral-gray100 overflow-y-auto h-full">
      <div className="w-full max-w-4xl mx-auto px-lg py-lg flex flex-col gap-md">

        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-neutral-gray800">Home</h2>
          <p className="text-sm text-neutral-gray500 mt-xs">Current biweekly period</p>
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-lg items-center lg:items-start">

          {/* Left column: schedule + save */}
          <div className="flex flex-col gap-md w-full lg:flex-1 lg:min-w-0">
            {/* Schedule preview */}
            <Card>
              <h3 className="text-xs font-semibold text-neutral-gray500 uppercase tracking-widest mb-md">Your Schedule</h3>
              {activeDays.length === 0 ? (
                <p className="text-sm text-neutral-gray500 text-center py-md">No days configured. Go to Settings.</p>
              ) : (
                <div className="flex flex-col gap-sm">
                  {activeDays.map((day) => (
                    <div key={day} className="flex items-center justify-between py-xs">
                      <span className="text-sm font-medium text-neutral-gray800 w-28">{day}</span>
                      <div className="flex flex-col items-end gap-xs">
                        {settings.schedule[day].map((e, i) => (
                          <span key={i} className="text-sm text-neutral-gray600 font-mono">
                            {e.timeIn} {e.ampmIn} – {e.timeOut} {e.ampmOut}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Save status */}
            {status === 'success' && (
              <div className="bg-semantic-success-light border border-semantic-success rounded-xl px-md py-md flex items-center gap-sm">
                <span className="text-semantic-success"><CheckIcon /></span>
                <p className="text-sm font-medium text-semantic-success">Timesheet saved successfully!</p>
              </div>
            )}
            {status === 'error' && error && (
              <div className="bg-semantic-error-light border border-semantic-error rounded-xl px-md py-sm">
                <p className="text-sm text-semantic-error">{error}</p>
              </div>
            )}

            <Button
              title={status === 'saving' ? 'Saving...' : 'Save Timesheet'}
              isLoading={status === 'saving'}
              disabled={activeDays.length === 0 || status === 'saving'}
              onClick={handleSave}
            />

          </div>

          {/* Right column: current period */}
          <div className="flex flex-col gap-md w-full lg:flex-1 lg:min-w-0">
            <Card>
              <div className="flex items-center justify-between mb-md">
                <div>
                  <h3 className="text-xs font-semibold text-neutral-gray500 uppercase tracking-widest">
                    {current?.periodLabel ?? 'Current Period'}
                  </h3>
                  {refreshLabel && (
                    <p className="text-xs text-neutral-gray400 mt-xs">{refreshLabel}</p>
                  )}
                </div>
                <div className="flex items-center gap-sm">
                  {current?.dayRows.some((r) => r.hoursDisplay) && (
                    <button onClick={clearAll} disabled={clearingAll}
                      className="text-xs text-semantic-error hover:opacity-80 disabled:opacity-40 font-medium">
                      {clearingAll ? 'Clearing...' : 'Clear all'}
                    </button>
                  )}
                  <button onClick={fetchCurrent} disabled={currentLoading}
                    className="text-neutral-gray400 hover:text-primary-blue transition-colors disabled:opacity-40">
                    <RefreshIcon />
                  </button>
                </div>
              </div>

              {currentLoading && !current && <p className="text-sm text-neutral-gray400 text-center py-md">Loading...</p>}
              {!currentLoading && !current && <p className="text-sm text-neutral-gray400 text-center py-md">Could not load timesheet</p>}

              {current && (
                <div className="flex flex-col gap-xs">
                  {current.dayRows.map((row) => {
                    const inSchedule = activeDays.some((d) => d.toLowerCase() === row.dayName.toLowerCase());
                    const isHoliday = row.isHoliday === 'Y';
                    const isEditing = edit?.nDate === row.nDate;
                    const rowBg = inSchedule && isHoliday ? 'bg-blue-50'
                      : inSchedule ? 'bg-semantic-success-light'
                      : isHoliday ? 'bg-neutral-gray100' : '';

                    return (
                      <div key={row.nDate} className={`rounded-lg ${rowBg} ${isEditing ? 'ring-1 ring-primary-blue' : ''}`}>
                        {/* Row header */}
                        <div className="flex items-center justify-between py-xs px-sm">
                          <span className="text-sm font-medium text-neutral-gray800 w-32">
                            {row.dayName} <span className="font-normal text-neutral-gray400 text-xs">{row.dateLabel}</span>
                          </span>
                          <div className="flex items-center gap-sm">
                            <span className="text-xs text-neutral-gray500 font-mono">
                              {row.hoursDisplay || (isHoliday && !inSchedule ? 'Holiday' : '—')}
                            </span>
                            {!isEditing && (
                              <button onClick={() => startEdit(row)}
                                className="text-neutral-gray400 hover:text-primary-blue transition-colors"
                                title="Edit hours">
                                <PencilIcon />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Inline editor */}
                        {isEditing && (
                          <div className="px-sm pb-sm flex flex-col gap-sm">
                            {edit.loading ? (
                              <p className="text-xs text-neutral-gray400 py-xs">Loading current times...</p>
                            ) : (
                              <>
                                {edit.entries.map((entry, i) => (
                                  <div key={i} className="flex items-center gap-xs flex-wrap">
                                    <input type="text" value={entry.timeIn} placeholder="0"
                                      onChange={(e) => setEdit((s) => s ? { ...s, entries: s.entries.map((en, j) => j === i ? { ...en, timeIn: e.target.value } : en) } : null)}
                                      className={`${inputClass} w-12`} />
                                    <select value={entry.ampmIn}
                                      onChange={(e) => setEdit((s) => s ? { ...s, entries: s.entries.map((en, j) => j === i ? { ...en, ampmIn: e.target.value as 'am' | 'pm' } : en) } : null)}
                                      className={inputClass}>
                                      {AMPM_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                    <span className="text-neutral-gray500 text-sm">–</span>
                                    <input type="text" value={entry.timeOut} placeholder="0"
                                      onChange={(e) => setEdit((s) => s ? { ...s, entries: s.entries.map((en, j) => j === i ? { ...en, timeOut: e.target.value } : en) } : null)}
                                      className={`${inputClass} w-12`} />
                                    <select value={entry.ampmOut}
                                      onChange={(e) => setEdit((s) => s ? { ...s, entries: s.entries.map((en, j) => j === i ? { ...en, ampmOut: e.target.value as 'am' | 'pm' } : en) } : null)}
                                      className={inputClass}>
                                      {AMPM_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                    {edit.entries.length > 1 && (
                                      <button onClick={() => setEdit((s) => s ? { ...s, entries: s.entries.filter((_, j) => j !== i) } : null)}
                                        className="text-neutral-gray400 hover:text-semantic-error text-lg leading-none">×</button>
                                    )}
                                  </div>
                                ))}
                                <button onClick={() => setEdit((s) => s ? { ...s, entries: [...s.entries, { ...BLANK }] } : null)}
                                  className="self-start text-xs text-primary-blue hover:underline">
                                  + Add time block
                                </button>
                                <div className="flex gap-sm mt-xs">
                                  <button onClick={saveEdit} disabled={edit.saving}
                                    className="text-xs bg-primary-blue text-white px-sm py-xs rounded-md hover:opacity-90 disabled:opacity-50">
                                    {edit.saving ? 'Saving...' : 'Save'}
                                  </button>
                                  <button onClick={cancelEdit}
                                    className="text-xs text-neutral-gray500 hover:text-neutral-gray800 px-sm py-xs">
                                    Cancel
                                  </button>
                                  {row.hoursDisplay && (
                                    <button onClick={() => { cancelEdit(); clearDay(row.nDate); }}
                                      className="text-xs text-semantic-error hover:underline ml-auto">
                                      Clear day
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Legend */}
                  <div className="flex items-center gap-md mt-sm pt-sm border-t border-neutral-gray100 flex-wrap">
                    <div className="flex items-center gap-xs">
                      <span className="w-3 h-3 rounded-sm bg-semantic-success-light border border-semantic-success inline-block" />
                      <span className="text-xs text-neutral-gray400">Scheduled</span>
                    </div>
                    <div className="flex items-center gap-xs">
                      <span className="w-3 h-3 rounded-sm bg-blue-50 border border-blue-200 inline-block" />
                      <span className="text-xs text-neutral-gray400">Holiday + scheduled</span>
                    </div>
                    <div className="flex items-center gap-xs">
                      <span className="w-3 h-3 rounded-sm bg-neutral-gray100 border border-neutral-gray200 inline-block" />
                      <span className="text-xs text-neutral-gray400">Holiday</span>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>

        </div>

        <p className="text-center text-xs text-neutral-gray500 pb-lg">UCR Timesheet Bot — your schedule is saved locally</p>
      </div>
    </div>
  );
};

export default TimesheetPage;
