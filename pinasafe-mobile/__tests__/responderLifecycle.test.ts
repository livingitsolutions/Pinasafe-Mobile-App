import { ApiError } from '../services/apiService';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getResponderLifecycleAction,
  getResponderLifecycleErrorMessage,
  runResponderLifecycle,
} from '../utils/responderLifecycle';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

describe('responder lifecycle', () => {
  test('A/B/E/F. exposes only the authoritative responder transitions', () => {
    expect(getResponderLifecycleAction('dispatched')).toEqual({
      label: 'Start Responding',
      targetStatus: 'responding',
    });
    expect(getResponderLifecycleAction('responding')).toEqual({
      label: 'Mark Resolved',
      targetStatus: 'resolved',
    });
    expect(getResponderLifecycleAction('pending')).toBeNull();
    expect(getResponderLifecycleAction('resolved')).toBeNull();
  });

  test('C/D. uses one status update and never performs team assignment', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const refresh = jest.fn().mockResolvedValue(undefined);

    await runResponderLifecycle({
      reportId: 'incident-1',
      currentStatus: 'dispatched',
      lock: { current: false },
      update,
      refresh,
    });

    expect(update).toHaveBeenCalledWith('incident-1', 'responding');
    expect(update).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(update.mock.calls.flat()).not.toContain('assign-team');
  });

  test('G. prevents a duplicate action while the first is in flight', async () => {
    let finishUpdate!: () => void;
    const update = jest.fn(() => new Promise<void>(resolve => { finishUpdate = resolve; }));
    const refresh = jest.fn().mockResolvedValue(undefined);
    const lock = { current: false };
    const options = { reportId: 'incident-1', currentStatus: 'responding' as const, lock, update, refresh };

    const first = runResponderLifecycle(options);
    await expect(runResponderLifecycle(options)).resolves.toBe('duplicate');
    expect(update).toHaveBeenCalledTimes(1);
    finishUpdate();
    await expect(first).resolves.toBe('updated');
  });

  test('H. refreshes authoritative state after 409 without retrying', async () => {
    const update = jest.fn().mockRejectedValue(new ApiError(409, 'backend detail'));
    const refresh = jest.fn().mockResolvedValue(undefined);

    await expect(runResponderLifecycle({
      reportId: 'incident-1', currentStatus: 'dispatched', lock: { current: false }, update, refresh,
    })).rejects.toMatchObject({ status: 409 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('I. presents 403 as permission/assignment failure', () => {
    expect(getResponderLifecycleErrorMessage(new ApiError(403, 'backend detail')))
      .toBe('You are not authorized or assigned to update this incident.');
  });

  test('J. active responder dispatch removes fabricated location metrics and legacy acceptance', () => {
    const dispatchSource = readFileSync(
      resolve(__dirname, '../app/(tabs-responder)/dispatch.tsx'),
      'utf8'
    );
    const mapSource = readFileSync(
      resolve(__dirname, '../app/(tabs-responder)/map.tsx'),
      'utf8'
    );

    expect(dispatchSource).not.toContain('10.3929');
    expect(dispatchSource).not.toContain('124.7544');
    expect(dispatchSource).not.toContain("return '1.2 km'");
    expect(dispatchSource).not.toContain('assignTeamToReport');
    expect(dispatchSource).not.toContain('>Accept<');
    expect(mapSource).not.toContain('calculateETAMinutes');
    expect(mapSource).not.toContain('getCurrentLocation');
    expect(mapSource).not.toContain('ETA:');
  });
});
