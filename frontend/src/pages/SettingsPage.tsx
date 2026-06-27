import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Switch from '@/components/ui/Switch';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { DAYS_OF_WEEK, type DayOfWeek, type Schedule, type TimeEntry } from '@/types/timesheet';

const AMPM_OPTIONS = ['am', 'pm'] as const;
const BLANK_ENTRY: TimeEntry = { timeIn: '', ampmIn: 'pm', timeOut: '', ampmOut: 'pm' };

const inputClass =
  'border border-neutral-gray200 rounded-md px-sm py-xs text-sm text-neutral-gray800 focus:outline-none focus:border-primary-blue focus:ring-1 focus:ring-primary-blue';

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
}) => (
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
      {AMPM_OPTIONS.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
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
      {AMPM_OPTIONS.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
    {showRemove && (
      <button
        onClick={onRemove}
        className="text-neutral-gray400 hover:text-semantic-error text-lg leading-none ml-xs"
      >
        ×
      </button>
    )}
  </div>
);

const ScheduleEditor = ({
  schedule,
  onChange,
}: {
  schedule: Schedule;
  onChange: (s: Schedule) => void;
}) => {
  const toggle = (day: DayOfWeek) => {
    const next = { ...schedule };
    if (next[day]?.length > 0) {
      delete next[day];
    } else {
      next[day] = [{ ...BLANK_ENTRY }];
    }
    onChange(next);
  };
  const update = (day: DayOfWeek, i: number, entry: TimeEntry) => {
    const entries = [...(schedule[day] ?? [])];
    entries[i] = entry;
    onChange({ ...schedule, [day]: entries });
  };
  const add = (day: DayOfWeek) => {
    onChange({ ...schedule, [day]: [...(schedule[day] ?? []), { ...BLANK_ENTRY }] });
  };
  const remove = (day: DayOfWeek, i: number) => {
    const entries = (schedule[day] ?? []).filter((_, j) => j !== i);
    if (entries.length === 0) {
      const next = { ...schedule };
      delete next[day];
      onChange(next);
    } else onChange({ ...schedule, [day]: entries });
  };

  return (
    <div className="flex flex-col gap-md">
      {DAYS_OF_WEEK.map((day) => {
        const entries = schedule[day] ?? [];
        const isActive = entries.length > 0;
        return (
          <div key={day}>
            <Switch label={day} value={isActive} onValueChange={() => toggle(day)} />
            {isActive && (
              <div className="mt-sm flex flex-col gap-sm">
                {entries.map((entry, i) => (
                  <TimeEntryRow
                    key={i}
                    entry={entry}
                    onChange={(e) => update(day, i, e)}
                    onRemove={() => remove(day, i)}
                    showRemove={entries.length > 1}
                  />
                ))}
                <button
                  onClick={() => add(day)}
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
  );
};

const SettingsPage = () => {
  const auth = useAuth();
  const settings = useSettings();

  // Determine how many job schedules to show
  const jobCount = Math.max(settings.jobLabels.length, settings.schedules.length, 1);
  const jobs = Array.from({ length: jobCount }, (_, i) => ({
    label: settings.jobLabels[i] ?? `Job ${i + 1}`,
    schedule: settings.schedules[i] ?? {},
  }));

  return (
    <div className="flex-1 bg-neutral-gray100 overflow-y-auto h-full">
      <div className="w-full max-w-4xl mx-auto px-lg py-lg flex flex-col gap-md">
        <div>
          <h2 className="text-2xl font-bold text-neutral-gray800">Settings</h2>
          <p className="text-sm text-neutral-gray500 mt-xs">
            Manage your account and weekly schedule
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-lg items-start">
          {/* Account */}
          <div className="flex flex-col gap-md w-full lg:flex-1 lg:min-w-0">
            <Card>
              <h2 className="text-xs font-semibold text-neutral-gray500 uppercase tracking-widest mb-md">
                Account
              </h2>
              <div className="flex flex-col gap-md py-sm">
                <div>
                  <p className="text-sm font-medium text-neutral-gray800">Signed in as</p>
                  <p className="text-base text-primary-blue font-semibold">
                    {auth.username ?? '—'}
                  </p>
                </div>
                <Button title="Sign Out" variant="danger" onClick={() => auth.logout()} />
              </div>
            </Card>
          </div>

          {/* Schedule editors — one per job */}
          <div className="flex flex-col gap-md w-full lg:flex-1 lg:min-w-0">
            {jobs.map((job, idx) => (
              <Card key={idx}>
                <h2 className="text-xs font-semibold text-neutral-gray500 uppercase tracking-widest mb-md">
                  {job.label} Schedule
                </h2>
                <ScheduleEditor
                  schedule={job.schedule}
                  onChange={(s) => settings.setJobSchedule(idx, s)}
                />
              </Card>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-neutral-gray500 pb-lg">UCR Timesheet Bot</p>
      </div>
    </div>
  );
};

export default SettingsPage;
