import { act, renderHook } from '@testing-library/react';
import { useTimesheet } from './useTimesheet';
import { useAuth } from '@/context/AuthContext';
import type { Schedule } from '@/types/timesheet';

jest.mock('@/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: () => Promise.resolve(body),
});

const schedule: Schedule = { Monday: [{ timeIn: '9', ampmIn: 'am', timeOut: '5', ampmOut: 'pm' }] };

describe('useTimesheet', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    mockUseAuth.mockReturnValue({ silentReAuth: jest.fn() });
  });

  it('starts idle with no error', () => {
    const { result } = renderHook(() => useTimesheet());
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('saves successfully without a jobKey', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ success: true, log: [] }));
    const { result } = renderHook(() => useTimesheet());

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save(schedule);
    });

    expect(saveResult).toEqual({ success: true, log: [] });
    expect(result.current.status).toBe('success');
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ schedule });
  });

  it('saves successfully with a jobKey', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ success: true }));
    const { result } = renderHook(() => useTimesheet());

    await act(async () => {
      await result.current.save(schedule, 'job-1');
    });

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ schedule, jobKey: 'job-1' });
  });

  it('re-authenticates and retries on a 401, succeeding the second time', async () => {
    const silentReAuth = jest.fn().mockResolvedValue(true);
    mockUseAuth.mockReturnValue({ silentReAuth });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({}, false, 401))
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    const { result } = renderHook(() => useTimesheet());

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save(schedule);
    });

    expect(silentReAuth).toHaveBeenCalled();
    expect(saveResult).toEqual({ success: true, log: undefined });
    expect(result.current.status).toBe('success');
  });

  it('reports a session-expired error when re-auth fails after a 401', async () => {
    const silentReAuth = jest.fn().mockResolvedValue(false);
    mockUseAuth.mockReturnValue({ silentReAuth });
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 401));

    const { result } = renderHook(() => useTimesheet());

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save(schedule);
    });

    expect(saveResult).toEqual({ success: false, error: 'Session expired' });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Session expired. Please sign in again.');
  });

  it('reports a server error message on a non-ok response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(
        { message: 'Bad day', log: [{ day: 'Mon', nDate: '1', status: 'error' }] },
        false,
        500
      )
    );
    const { result } = renderHook(() => useTimesheet());

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save(schedule);
    });

    expect(saveResult?.error).toBe('Bad day');
    expect(result.current.status).toBe('error');
  });

  it('falls back to a generic error message when the server gives none', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}, false, 500));
    const { result } = renderHook(() => useTimesheet());

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save(schedule);
    });

    expect(saveResult?.error).toBe('Save failed');
  });

  it('falls back to data.error when message is absent on a non-ok response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ error: 'Boom' }, false, 500));
    const { result } = renderHook(() => useTimesheet());

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save(schedule);
    });

    expect(saveResult?.error).toBe('Boom');
  });

  it('handles a network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useTimesheet());

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save(schedule);
    });

    expect(saveResult).toEqual({ success: false, error: 'Network error' });
    expect(result.current.error).toBe('Network error. Please try again.');
  });

  it('reset returns to idle with no error', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useTimesheet());

    await act(async () => {
      await result.current.save(schedule);
    });
    expect(result.current.status).toBe('error');

    act(() => result.current.reset());

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });
});
