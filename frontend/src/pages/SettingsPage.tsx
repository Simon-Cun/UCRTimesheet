import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Switch from '@/components/ui/Switch';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { DAYS_OF_WEEK, type DayOfWeek, type TimeEntry } from '@/types/timesheet';

const AMPM_OPTIONS = ['am', 'pm'] as const;

const BLANK_ENTRY: TimeEntry = { timeIn: '', ampmIn: 'pm', timeOut: '', ampmOut: 'pm' };

const TimeEntryRow = ({
  entry,
  onChange,
  onRemove,
  showRemove,
}: {
  entry: TimeEntry;
  onChange: (e: TimeEntry) => void;
  onRemove: () => void;
  showRemove: boolean;
}) => {
  const inputClass =
    'border border-neutral-gray200 rounded-md px-sm py-xs text-sm text-neutral-gray800 focus:outline-none focus:border-primary-blue focus:ring-1 focus:ring-primary-blue';

  return (
    <div className="flex items-center gap-sm">
      <input
        type="text"
        value={entry.timeIn}
        onChange={(e) => onChange({ ...entry, timeIn: e.target.value })}
        placeholder="00:00"
        className={`${inputClass} w-16`}
      />
      <select
        value={entry.ampmIn}
        onChange={(e) => onChange({ ...entry, ampmIn: e.target.value as 'am' | 'pm' })}
        className={inputClass}
      >
        {AMPM_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <span className="text-neutral-gray500 text-sm">–</span>
      <input
        type="text"
        value={entry.timeOut}
        onChange={(e) => onChange({ ...entry, timeOut: e.target.value })}
        placeholder="00:00"
        className={`${inputClass} w-16`}
      />
      <select
        value={entry.ampmOut}
        onChange={(e) => onChange({ ...entry, ampmOut: e.target.value as 'am' | 'pm' })}
        className={inputClass}
      >
        {AMPM_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      {showRemove && (
        <button
          onClick={onRemove}
          className="text-neutral-gray400 hover:text-semantic-error text-lg leading-none ml-xs"
          title="Remove"
        >
          ×
        </button>
      )}
    </div>
  );
};

const SettingsPage = () => {
  const auth = useAuth();
  const settings = useSettings();

  const toggleDay = (day: DayOfWeek) => {
    const next = { ...settings.schedule };
    if (next[day]?.length > 0) {
      delete next[day];
    } else {
      next[day] = [{ ...BLANK_ENTRY }];
    }
    settings.setSchedule(next);
  };

  const updateEntry = (day: DayOfWeek, index: number, entry: TimeEntry) => {
    const entries = [...(settings.schedule[day] ?? [])];
    entries[index] = entry;
    settings.setSchedule({ ...settings.schedule, [day]: entries });
  };

  const addEntry = (day: DayOfWeek) => {
    const entries = [...(settings.schedule[day] ?? []), { ...BLANK_ENTRY }];
    settings.setSchedule({ ...settings.schedule, [day]: entries });
  };

  const removeEntry = (day: DayOfWeek, index: number) => {
    const entries = (settings.schedule[day] ?? []).filter((_, i) => i !== index);
    if (entries.length === 0) {
      const next = { ...settings.schedule };
      delete next[day];
      settings.setSchedule(next);
    } else {
      settings.setSchedule({ ...settings.schedule, [day]: entries });
    }
  };

  return (
    <div className="flex-1 bg-neutral-gray100 overflow-y-auto h-full">
      <div className="w-full max-w-4xl mx-auto px-lg py-lg flex flex-col gap-md">

        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-neutral-gray800">Settings</h2>
          <p className="text-sm text-neutral-gray500 mt-xs">Manage your account and weekly schedule</p>
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-lg items-center lg:items-start">

          {/* Left column: account */}
          <div className="flex flex-col gap-md w-full lg:flex-1 lg:min-w-0">
            <Card>
              <h2 className="text-xs font-semibold text-neutral-gray500 uppercase tracking-widest mb-md">
                Account
              </h2>
              <div className="flex flex-col gap-md py-sm">
                <div>
                  <p className="text-sm font-medium text-neutral-gray800">Signed in as</p>
                  <p className="text-base text-primary-blue font-semibold">{auth.username ?? '—'}</p>
                </div>
                <Button title="Sign Out" variant="danger" onClick={() => auth.logout()} />
              </div>
            </Card>
          </div>

          {/* Right column: schedule editor */}
          <div className="flex flex-col gap-md w-full lg:flex-1 lg:min-w-0">
            <Card>
              <h2 className="text-xs font-semibold text-neutral-gray500 uppercase tracking-widest mb-md">
                Weekly Schedule
              </h2>
              <div className="flex flex-col gap-md">
                {DAYS_OF_WEEK.map((day) => {
                  const entries = settings.schedule[day] ?? [];
                  const isActive = entries.length > 0;
                  return (
                    <div key={day}>
                      <Switch
                        label={day}
                        value={isActive}
                        onValueChange={() => toggleDay(day)}
                      />
                      {isActive && (
                        <div className="mt-sm flex flex-col gap-sm">
                          {entries.map((entry, i) => (
                            <TimeEntryRow
                              key={i}
                              entry={entry}
                              onChange={(e) => updateEntry(day, i, e)}
                              onRemove={() => removeEntry(day, i)}
                              showRemove={entries.length > 1}
                            />
                          ))}
                          <button
                            onClick={() => addEntry(day)}
                            className="self-start text-xs text-primary-blue hover:underline mt-xs"
                          >
                            + Add time block
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

        </div>

        <p className="text-center text-xs text-neutral-gray500 pb-lg">UCR Timesheet Bot</p>
      </div>
    </div>
  );
};

export default SettingsPage;
