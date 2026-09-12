import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider, useSettings } from './SettingsContext';
import { STORAGE_KEYS } from '@/utils/constants';
import type { Schedule } from '@/types/timesheet';

const jsonResponse = (body: unknown, ok = true) => ({
  ok,
  json: () => Promise.resolve(body),
});

const Probe = () => {
  const settings = useSettings();
  return (
    <div>
      <span data-testid="schedule">{JSON.stringify(settings.schedule)}</span>
      <span data-testid="schedules">{JSON.stringify(settings.schedules)}</span>
      <span data-testid="labels">{JSON.stringify(settings.jobLabels)}</span>
      <span data-testid="remember">{String(settings.rememberMe)}</span>
      <button
        onClick={() =>
          settings.setSchedule({
            Monday: [{ timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' }],
          })
        }
      >
        set-schedule
      </button>
      <button onClick={() => settings.setJobSchedule(2, { Tuesday: [] })}>set-job-2</button>
      <button onClick={() => settings.setJobLabels(['Job A', 'Job B'])}>set-labels</button>
      <button onClick={() => settings.setRememberMe(false)}>set-remember</button>
    </div>
  );
};

const renderSettings = () =>
  render(
    <SettingsProvider>
      <Probe />
    </SettingsProvider>
  );

describe('SettingsContext', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ schedule: null }));
  });

  it('throws when useSettings is used outside a provider', () => {
    const BadProbe = () => {
      useSettings();
      return null;
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<BadProbe />)).toThrow('useSettings must be used inside SettingsProvider');
    spy.mockRestore();
  });

  it('starts with empty defaults when nothing is stored', async () => {
    renderSettings();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId('schedule')).toHaveTextContent('{}');
    expect(screen.getByTestId('labels')).toHaveTextContent('[]');
    expect(screen.getByTestId('remember')).toHaveTextContent('true');
  });

  it('loads the new schedules-array format from localStorage', () => {
    const stored = { schedules: [{ Monday: [] }], jobLabels: ['A'], rememberMe: false };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(stored));
    renderSettings();
    expect(screen.getByTestId('schedules')).toHaveTextContent('[{"Monday":[]}]');
    expect(screen.getByTestId('remember')).toHaveTextContent('false');
  });

  it('migrates the legacy single-schedule format from localStorage', () => {
    const legacy = { schedule: { Friday: [] }, jobLabels: ['Legacy'] };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(legacy));
    renderSettings();
    expect(screen.getByTestId('schedules')).toHaveTextContent('[{"Friday":[]}]');
    expect(screen.getByTestId('labels')).toHaveTextContent('["Legacy"]');
  });

  it('migrates the legacy format even without jobLabels', () => {
    const legacy = { schedule: { Friday: [] } };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(legacy));
    renderSettings();
    expect(screen.getByTestId('labels')).toHaveTextContent('[]');
  });

  it('falls back to defaults on malformed localStorage JSON', () => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, '{not-json');
    renderSettings();
    expect(screen.getByTestId('schedule')).toHaveTextContent('{}');
  });

  it('falls back to defaults when stored JSON has neither schedules nor schedule', () => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ rememberMe: false }));
    renderSettings();
    expect(screen.getByTestId('schedule')).toHaveTextContent('{}');
  });

  it('merges a non-empty remote schedule into slot 0 on mount', async () => {
    const remote: Schedule = {
      Wednesday: [{ timeIn: '1', ampmIn: 'pm', timeOut: '2', ampmOut: 'pm' }],
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ schedule: remote }));
    renderSettings();
    await waitFor(() => expect(screen.getByTestId('schedule')).toHaveTextContent('Wednesday'));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS)!).schedules[0]).toEqual(remote);
  });

  it('ignores an empty-object remote schedule', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ schedule: {} }));
    renderSettings();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId('schedule')).toHaveTextContent('{}');
  });

  it('ignores a null remote schedule', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ schedule: null }));
    renderSettings();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId('schedule')).toHaveTextContent('{}');
  });

  it('treats a non-ok remote response as no schedule', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false));
    renderSettings();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId('schedule')).toHaveTextContent('{}');
  });

  it('swallows a network error fetching the remote schedule', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network'));
    renderSettings();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByTestId('schedule')).toHaveTextContent('{}');
  });

  it('setSchedule updates slot 0 and pushes to the server', async () => {
    renderSettings();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByText('set-schedule'));

    expect(screen.getByTestId('schedule')).toHaveTextContent('Monday');
    await waitFor(() =>
      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/schedule',
        expect.objectContaining({ method: 'POST' })
      )
    );
  });

  it('setJobSchedule pads intermediate slots and only pushes remote for job 0', async () => {
    renderSettings();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      await userEvent.click(screen.getByText('set-job-2'));
    });

    const schedules = JSON.parse(screen.getByTestId('schedules').textContent!);
    expect(schedules).toEqual([{}, {}, { Tuesday: [] }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('setJobLabels updates the labels', async () => {
    renderSettings();
    await userEvent.click(screen.getByText('set-labels'));
    expect(screen.getByTestId('labels')).toHaveTextContent('["Job A","Job B"]');
  });

  it('setRememberMe updates the flag', async () => {
    renderSettings();
    await userEvent.click(screen.getByText('set-remember'));
    expect(screen.getByTestId('remember')).toHaveTextContent('false');
  });

  it('pushRemote silently ignores network errors when saving', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ schedule: null }))
      .mockRejectedValueOnce(new Error('network'));
    renderSettings();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      await userEvent.click(screen.getByText('set-schedule'));
    });

    expect(screen.getByTestId('schedule')).toHaveTextContent('Monday');
  });
});
