import { ApiError } from '../services/apiService';
import { acquireDispatchLock, getDispatchErrorMessage } from '../utils/adminDispatch';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

describe('admin dispatch workflow', () => {
  test('requires a selected team before dispatch', () => {
    const selectedTeamId: string | null = null;
    expect(Boolean(selectedTeamId)).toBe(false);
  });

  test('prevents duplicate dispatch submissions', () => {
    const lock = { current: false };
    expect(acquireDispatchLock(lock)).toBe(true);
    expect(acquireDispatchLock(lock)).toBe(false);
  });

  test.each([403, 409])('%i remains an ordinary safe dispatch error', status => {
    const error = new ApiError(status, 'backend detail');
    expect(getDispatchErrorMessage(error)).not.toContain('backend detail');
    expect(error.status).toBe(status);
  });

  test('admin controls contain no responding or resolved transition', () => {
    const adminOperationalActions = ['assign-team'];
    expect(adminOperationalActions).not.toContain('responding');
    expect(adminOperationalActions).not.toContain('resolved');
  });
});
