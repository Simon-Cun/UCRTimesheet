import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TimesheetPage from './TimesheetPage';
import { useSettings } from '@/context/SettingsContext';
import { useTimesheet } from '@/hooks/useTimesheet';
import type { Schedule } from '@/types/timesheet';

jest.mock('@/context/SettingsContext', () => ({
  useSettings: jest.fn(),
}));
jest.mock('@/hooks/useTimesheet', () => ({
  useTimesheet: jest.fn(),
}));

const mockUseSettings = useSettings as jest.Mock;
const mockUseTimesheet = useTimesheet as jest.Mock;

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: () => Promise.resolve(body),
});

const baseSettings = (schedules: Schedule[] = [{}]) => ({
  schedules,
  schedule: schedules[0] ?? {},
  jobLabels: [],
  rememberMe: true,
  setSchedule: jest.fn(),
  setJobSchedule: jest.fn(),
  setJobLabels: jest.fn(),
  setRememberMe: jest.fn(),
});

const baseTimesheetHook = (overrides = {}) => ({
  status: 'idle',
  error: null,
  save: jest.fn().mockResolvedValue({ success: true }),
  reset: jest.fn(),
  ...overrides,
});

const singleJobCurrent = {
  periodLabel: 'Jun 1 - Jun 14',
  jobs: [{ jobKey: '', jobCode: 'J1', label: 'Job 1', position: '' }],
  dayRows: [
    {
      dayName: 'Monday',
      nDate: '2024-06-03',
      isHoliday: 'N',
      hoursDisplay: '8.00',
      jobHours: {},
      dateLabel: 'Jun 3',
    },
    {
      dayName: 'Tuesday',
      nDate: '2024-06-04',
      isHoliday: 'N',
      hoursDisplay: '',
      jobHours: {},
      dateLabel: 'Jun 4',
    },
  ],
};

const multiJobCurrent = {
  periodLabel: 'Jun 1 - Jun 14',
  jobs: [
    { jobKey: 'A', jobCode: 'J1', label: 'Job A', position: 'Reader' },
    { jobKey: 'B', jobCode: 'J2', label: 'Job B', position: 'Tutor' },
  ],
  dayRows: [
    {
      dayName: 'Monday',
      nDate: '2024-06-03',
      isHoliday: 'N',
      hoursDisplay: '',
      jobHours: { A: '4.00' },
      dateLabel: 'Jun 3',
    },
  ],
};

describe('TimesheetPage', () => {
  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ dayRows: [], jobs: [], periodLabel: '' }));
    mockUseSettings.mockReturnValue(baseSettings());
    mockUseTimesheet.mockReturnValue(baseTimesheetHook());
  });

  it('shows a loading indicator while the initial fetch is pending', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    render(<TimesheetPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    await act(async () => {
      resolveFetch(jsonResponse({ dayRows: [], jobs: [], periodLabel: '' }));
    });
  });

  it('shows a session-expired message on a 401', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 401));
    render(<TimesheetPage />);
    expect(await screen.findByText('Session expired')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'timesheet.ucr.edu' })).toBeInTheDocument();
  });

  it('shows a generic failure message on a non-401 error response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 500));
    render(<TimesheetPage />);
    expect(await screen.findByText('Could not load timesheet')).toBeInTheDocument();
  });

  it('shows a generic failure message when the fetch throws', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network'));
    render(<TimesheetPage />);
    expect(await screen.findByText('Could not load timesheet')).toBeInTheDocument();
  });

  it('shows "No timesheets available" when there are no day rows', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ dayRows: [], jobs: [], periodLabel: 'Period' })
    );
    render(<TimesheetPage />);
    expect(await screen.findByText('No timesheets available')).toBeInTheDocument();
  });

  it('shows "No days configured" when the active schedule is empty', async () => {
    render(<TimesheetPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText('No days configured. Go to Settings.')).toBeInTheDocument();
  });

  it('renders the configured schedule for the active job', async () => {
    mockUseSettings.mockReturnValue(
      baseSettings([{ Monday: [{ timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' }] }])
    );
    render(<TimesheetPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText('9 am – 5 pm')).toBeInTheDocument();
  });

  it('disables Save when there are no active days, and enables it otherwise', async () => {
    render(<TimesheetPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Save Timesheet' })).toBeDisabled();
  });

  it('saves the active schedule and refetches on success', async () => {
    const save = jest.fn().mockResolvedValue({ success: true });
    mockUseSettings.mockReturnValue(
      baseSettings([{ Monday: [{ timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' }] }])
    );
    mockUseTimesheet.mockReturnValue(baseTimesheetHook({ save }));
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(singleJobCurrent))
      .mockResolvedValueOnce(jsonResponse(singleJobCurrent));

    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Jun 1 - Jun 14')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Save Timesheet' }));

    expect(save).toHaveBeenCalledWith(
      { Monday: [{ timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' }] },
      ''
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it('does not refetch when save fails', async () => {
    const save = jest.fn().mockResolvedValue({ success: false, error: 'boom' });
    mockUseSettings.mockReturnValue(
      baseSettings([{ Monday: [{ timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' }] }])
    );
    mockUseTimesheet.mockReturnValue(baseTimesheetHook({ save }));
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(singleJobCurrent));

    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Jun 1 - Jun 14')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Save Timesheet' }));

    expect(save).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('shows a saving state on the button while status is saving', async () => {
    mockUseSettings.mockReturnValue(
      baseSettings([{ Monday: [{ timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' }] }])
    );
    mockUseTimesheet.mockReturnValue(baseTimesheetHook({ status: 'saving' }));
    render(<TimesheetPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });

  it('shows a success banner when status is success', async () => {
    mockUseTimesheet.mockReturnValue(baseTimesheetHook({ status: 'success' }));
    render(<TimesheetPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText('Timesheet saved successfully!')).toBeInTheDocument();
  });

  it('shows an error banner when status is error', async () => {
    mockUseTimesheet.mockReturnValue(baseTimesheetHook({ status: 'error', error: 'Save failed' }));
    render(<TimesheetPage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText('Save failed')).toBeInTheDocument();
  });

  it('renders job tabs for multiple jobs and switches the active job', async () => {
    mockUseSettings.mockReturnValue(baseSettings([{}, {}]));
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(multiJobCurrent));

    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Reader')).toBeInTheDocument());
    expect(screen.getByText('Tutor')).toBeInTheDocument();
    expect(screen.getByText('4.00')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Tutor'));
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('does not render job tabs for a single job', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(singleJobCurrent));
    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Jun 1 - Jun 14')).toBeInTheDocument());
    expect(screen.getByText('8.00')).toBeInTheDocument();
  });

  it('marks a scheduled day and shows the holiday label when unscheduled', async () => {
    mockUseSettings.mockReturnValue(
      baseSettings([{ Monday: [{ timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' }] }])
    );
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({
        periodLabel: 'P',
        jobs: [{ jobKey: '', jobCode: 'J1', label: 'Job 1', position: '' }],
        dayRows: [
          {
            dayName: 'Monday',
            nDate: '1',
            isHoliday: 'Y',
            hoursDisplay: '',
            jobHours: {},
            dateLabel: 'Jun 3',
          },
          {
            dayName: 'Tuesday',
            nDate: '2',
            isHoliday: 'Y',
            hoursDisplay: '',
            jobHours: {},
            dateLabel: 'Jun 4',
          },
        ],
      })
    );
    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('P')).toBeInTheDocument());
    expect(screen.getAllByText('Holiday')[0]).toBeInTheDocument();
  });

  it('shows the clear-all control only when a row has hours, and clears all filled rows', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(singleJobCurrent))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse(singleJobCurrent));

    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Jun 1 - Jun 14')).toBeInTheDocument());

    await userEvent.click(screen.getByText('Clear all'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    const dayCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(dayCall[0]).toBe('/api/timesheet/day');
  });

  it('hides the clear-all control when no row has hours', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ ...singleJobCurrent, dayRows: [{ ...singleJobCurrent.dayRows[1] }] })
    );
    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Jun 1 - Jun 14')).toBeInTheDocument());
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
  });

  it('refreshes on demand via the refresh button using a forced POST', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(singleJobCurrent))
      .mockResolvedValueOnce(jsonResponse(singleJobCurrent));

    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Jun 1 - Jun 14')).toBeInTheDocument());

    const buttons = screen.getAllByRole('button');
    const refreshButton = buttons.find((b) => b.querySelector('svg polyline'))!;
    await userEvent.click(refreshButton);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect((global.fetch as jest.Mock).mock.calls[1][1]).toEqual(
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('starts editing a day, loading existing entries, and can cancel', async () => {
    let resolveDay: (v: unknown) => void = () => {};
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(singleJobCurrent))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDay = resolve;
        })
      );

    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Jun 1 - Jun 14')).toBeInTheDocument());

    await userEvent.click(screen.getAllByTitle('Edit hours')[0]);
    expect(screen.getByText('Loading current times...')).toBeInTheDocument();

    await act(async () => {
      resolveDay(
        jsonResponse({ entries: [{ timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' }] })
      );
    });
    await waitFor(() => expect(screen.getAllByDisplayValue('9')[0]).toBeInTheDocument());
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe(
      '/api/timesheet/day?nDate=2024-06-03'
    );

    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });

  it('includes the jobKey query param when starting an edit for a specific job', async () => {
    mockUseSettings.mockReturnValue(baseSettings([{}, {}]));
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(multiJobCurrent))
      .mockResolvedValueOnce(jsonResponse({ entries: [] }));

    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Reader')).toBeInTheDocument());

    await userEvent.click(screen.getAllByTitle('Edit hours')[0]);

    await waitFor(() =>
      expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe(
        '/api/timesheet/day?nDate=2024-06-03&jobKey=A'
      )
    );
  });

  it('falls back to a blank entry when the loaded entries are empty', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(singleJobCurrent))
      .mockResolvedValueOnce(jsonResponse({ entries: [] }));

    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Jun 1 - Jun 14')).toBeInTheDocument());

    await userEvent.click(screen.getAllByTitle('Edit hours')[0]);
    await waitFor(() =>
      expect(screen.queryByText('Loading current times...')).not.toBeInTheDocument()
    );
    expect(screen.getAllByPlaceholderText('0')[0]).toHaveValue('');
  });

  it('falls back to a blank entry when loading the day fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(singleJobCurrent))
      .mockRejectedValueOnce(new Error('network'));

    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Jun 1 - Jun 14')).toBeInTheDocument());

    await userEvent.click(screen.getAllByTitle('Edit hours')[0]);
    await waitFor(() =>
      expect(screen.queryByText('Loading current times...')).not.toBeInTheDocument()
    );
    expect(screen.getAllByPlaceholderText('0')[0]).toHaveValue('');
  });

  it('edits entry fields, adds and removes time blocks, and saves', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(singleJobCurrent))
      .mockResolvedValueOnce(
        jsonResponse({
          entries: [
            { timeIn: '9', ampmIn: 'am', timeOut: '12', ampmOut: 'pm' },
            { timeIn: '1', ampmIn: 'pm', timeOut: '5', ampmOut: 'pm' },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse(singleJobCurrent));

    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Jun 1 - Jun 14')).toBeInTheDocument());
    await userEvent.click(screen.getAllByTitle('Edit hours')[0]);
    await waitFor(() => expect(screen.getAllByDisplayValue('9')[0]).toBeInTheDocument());

    const timeInInputs = screen.getAllByPlaceholderText('0');
    await userEvent.clear(timeInInputs[0]);
    await userEvent.type(timeInInputs[0], '8');
    expect(timeInInputs[0]).toHaveValue('8');

    const selects = screen.getAllByRole('combobox');
    await userEvent.selectOptions(selects[0], 'pm');
    expect(selects[0]).toHaveValue('pm');

    await userEvent.click(screen.getByText('+ Add time block'));
    expect(screen.getAllByPlaceholderText('0')).toHaveLength(6);

    const removeButtons = screen.getAllByText('×');
    await userEvent.click(removeButtons[0]);
    expect(screen.getAllByPlaceholderText('0')).toHaveLength(4);

    await userEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
    expect((global.fetch as jest.Mock).mock.calls[2][0]).toBe('/api/timesheet/day');
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('clears a single day from within the edit panel', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(singleJobCurrent))
      .mockResolvedValueOnce(
        jsonResponse({ entries: [{ timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' }] })
      )
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse(singleJobCurrent));

    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Jun 1 - Jun 14')).toBeInTheDocument());
    await userEvent.click(screen.getAllByTitle('Edit hours')[0]);
    await waitFor(() => expect(screen.getByText('Clear day')).toBeInTheDocument());

    await userEvent.click(screen.getByText('Clear day'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
    expect(screen.queryByText('Clear day')).not.toBeInTheDocument();
  });

  it('does not show Clear day for a row with no existing hours', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(singleJobCurrent))
      .mockResolvedValueOnce(jsonResponse({ entries: [] }));

    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Jun 1 - Jun 14')).toBeInTheDocument());
    const editButtons = screen.getAllByTitle('Edit hours');
    await userEvent.click(editButtons[1]);
    await waitFor(() =>
      expect(screen.queryByText('Loading current times...')).not.toBeInTheDocument()
    );
    expect(screen.queryByText('Clear day')).not.toBeInTheDocument();
  });

  it('shows an elapsed-seconds and elapsed-minutes refresh label', async () => {
    jest.useFakeTimers({ now: new Date('2024-06-03T12:00:00Z') });
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(singleJobCurrent));

    render(<TimesheetPage />);
    await waitFor(() => expect(screen.getByText('Jun 1 - Jun 14')).toBeInTheDocument());
    expect(screen.getByText('Refreshed just now')).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(screen.getByText(/Refreshed \d+s ago/)).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(70_000);
    });
    expect(screen.getByText(/Refreshed \d+m ago/)).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(3_600_000);
    });
    expect(screen.getByText(/Refreshed \d{1,2}:\d{2}/)).toBeInTheDocument();

    jest.useRealTimers();
  });
});
