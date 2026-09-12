import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from './SettingsPage';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';

jest.mock('@/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));
jest.mock('@/context/SettingsContext', () => ({
  useSettings: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseSettings = useSettings as jest.Mock;

describe('SettingsPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ username: 'scun002', logout: jest.fn() });
  });

  it('shows the signed-in username and signs out on click', async () => {
    const logout = jest.fn();
    mockUseAuth.mockReturnValue({ username: 'scun002', logout });
    mockUseSettings.mockReturnValue({ jobLabels: [], schedules: [{}], setJobSchedule: jest.fn() });

    render(<SettingsPage />);
    expect(screen.getByText('scun002')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    expect(logout).toHaveBeenCalled();
  });

  it('renders one schedule card per job, falling back to a generic label', () => {
    mockUseSettings.mockReturnValue({
      jobLabels: ['Reader'],
      schedules: [{}, {}],
      setJobSchedule: jest.fn(),
    });

    render(<SettingsPage />);
    expect(screen.getByText('Reader Schedule')).toBeInTheDocument();
    expect(screen.getByText('Job 2 Schedule')).toBeInTheDocument();
  });

  it('renders at least one job card even with no schedules or labels', () => {
    mockUseSettings.mockReturnValue({ jobLabels: [], schedules: [], setJobSchedule: jest.fn() });

    render(<SettingsPage />);
    expect(screen.getByText('Job 1 Schedule')).toBeInTheDocument();
  });

  it('toggles a day on, adding a blank time block', async () => {
    const setJobSchedule = jest.fn();
    mockUseSettings.mockReturnValue({ jobLabels: [], schedules: [{}], setJobSchedule });

    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('switch', { name: 'Monday' }));

    expect(setJobSchedule).toHaveBeenCalledWith(0, {
      Monday: [{ timeIn: '', ampmIn: 'pm', timeOut: '', ampmOut: 'pm' }],
    });
  });

  it('toggles an active day off', async () => {
    const setJobSchedule = jest.fn();
    mockUseSettings.mockReturnValue({
      jobLabels: [],
      schedules: [{ Monday: [{ timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' }] }],
      setJobSchedule,
    });

    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('switch', { name: 'Monday' }));

    expect(setJobSchedule).toHaveBeenCalledWith(0, {});
  });

  it('adds a time block to an already-active day', async () => {
    const setJobSchedule = jest.fn();
    mockUseSettings.mockReturnValue({
      jobLabels: [],
      schedules: [{ Monday: [{ timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' }] }],
      setJobSchedule,
    });

    render(<SettingsPage />);
    await userEvent.click(screen.getByText('+ Add time block'));

    expect(setJobSchedule).toHaveBeenCalledWith(0, {
      Monday: [
        { timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' },
        { timeIn: '', ampmIn: 'pm', timeOut: '', ampmOut: 'pm' },
      ],
    });
  });

  it('removes one of several time blocks for a day', async () => {
    const setJobSchedule = jest.fn();
    mockUseSettings.mockReturnValue({
      jobLabels: [],
      schedules: [
        {
          Monday: [
            { timeIn: '9', ampmIn: 'am', timeOut: '12', ampmOut: 'pm' },
            { timeIn: '1', ampmIn: 'pm', timeOut: '5', ampmOut: 'pm' },
          ],
        },
      ],
      setJobSchedule,
    });

    render(<SettingsPage />);
    const removeButtons = screen.getAllByText('×');
    await userEvent.click(removeButtons[0]);

    expect(setJobSchedule).toHaveBeenCalledWith(0, {
      Monday: [{ timeIn: '1', ampmIn: 'pm', timeOut: '5', ampmOut: 'pm' }],
    });
  });

  it('removing the only time block for a day clears the day', async () => {
    const setJobSchedule = jest.fn();
    mockUseSettings.mockReturnValue({
      jobLabels: [],
      schedules: [{ Monday: [{ timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' }] }],
      setJobSchedule,
    });

    render(<SettingsPage />);
    // Only one entry, so no remove (×) button is shown for it.
    expect(screen.queryByText('×')).not.toBeInTheDocument();
  });

  it('updates the time-in value of an entry', async () => {
    const setJobSchedule = jest.fn();
    mockUseSettings.mockReturnValue({
      jobLabels: [],
      schedules: [{ Monday: [{ timeIn: '', ampmIn: 'pm', timeOut: '', ampmOut: 'pm' }] }],
      setJobSchedule,
    });

    render(<SettingsPage />);
    const card = screen.getByText('Job 1 Schedule').closest('div')!;
    const timeInputs = within(card.parentElement as HTMLElement).getAllByPlaceholderText('00:00');
    await userEvent.type(timeInputs[0], '9');

    expect(setJobSchedule).toHaveBeenCalled();
    const lastCallArg = setJobSchedule.mock.calls.at(-1)![1];
    expect(lastCallArg.Monday[0].timeIn).toBe('9');
  });

  it('changes the am/pm select for an entry', async () => {
    const setJobSchedule = jest.fn();
    mockUseSettings.mockReturnValue({
      jobLabels: [],
      schedules: [{ Monday: [{ timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' }] }],
      setJobSchedule,
    });

    render(<SettingsPage />);
    const selects = screen.getAllByRole('combobox');
    await userEvent.selectOptions(selects[0], 'pm');

    expect(setJobSchedule).toHaveBeenCalledWith(0, {
      Monday: [{ timeIn: '9', ampmIn: 'pm', timeOut: '5', ampmOut: 'pm' }],
    });
  });
});
