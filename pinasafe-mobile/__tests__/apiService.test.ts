/**
 * F2 foundation tests for the active API service: error model, 401 session
 * expiration, and login-failure isolation. Network/AsyncStorage are mocked;
 * no production/external systems are contacted.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService, ApiError, isApiError } from '../services/apiService';

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response);

describe('apiService (F2 foundation)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
    // @ts-expect-error mock helper
    AsyncStorage.__resetMockStorage?.();
    await apiService.clearLocalSession();
    apiService.onSessionExpired(null);
  });

  test('A. successful request resolves normally with data', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await apiService.get('/alerts');

    expect(result.data).toEqual({ ok: true });
  });

  test('B. non-2xx response throws a structured ApiError', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(400, { error: 'Invalid team assignment' })
    );

    try {
      await apiService.get('/teams');
      throw new Error('expected rejection');
    } catch (error) {
      expect(isApiError(error)).toBe(true);
      expect((error as ApiError).status).toBe(400);
      expect((error as Error).message).toBe('Invalid team assignment');
    }
  });

  test('C. 401 on an authenticated request clears the token and notifies the session listener', async () => {
    apiService.setToken('stale-token');
    await AsyncStorage.setItem('auth_token', 'stale-token');

    const sessionExpired = jest.fn();
    apiService.onSessionExpired(sessionExpired);

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(401, { error: 'Invalid token' }));

    await expect(apiService.get('/users/profile')).rejects.toThrow('Invalid token');

    expect(apiService.getToken()).toBeNull();
    expect(await AsyncStorage.getItem('auth_token')).toBeNull();
    expect(sessionExpired).toHaveBeenCalledTimes(1);
  });

  test('D. 403 does not clear the session', async () => {
    apiService.setToken('valid-token');
    const sessionExpired = jest.fn();
    apiService.onSessionExpired(sessionExpired);

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(403, { error: 'Insufficient permissions' })
    );

    await expect(apiService.post('/emergency-reports/x/assign-team', {})).rejects.toThrow(
      'Insufficient permissions'
    );

    expect(apiService.getToken()).toBe('valid-token');
    expect(sessionExpired).not.toHaveBeenCalled();
  });

  test('E. 409 does not clear the session', async () => {
    apiService.setToken('valid-token');
    const sessionExpired = jest.fn();
    apiService.onSessionExpired(sessionExpired);

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(409, { error: 'Emergency report state changed; please retry' })
    );

    await expect(apiService.put('/emergency-reports/x', { status: 'resolved' })).rejects.toThrow(
      'Emergency report state changed; please retry'
    );

    expect(apiService.getToken()).toBe('valid-token');
    expect(sessionExpired).not.toHaveBeenCalled();
  });

  test('F. a 401 from login does not clear an unrelated session or recurse', async () => {
    apiService.setToken('someone-elses-token');
    const sessionExpired = jest.fn();
    apiService.onSessionExpired(sessionExpired);

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(401, { error: 'Invalid email or password' })
    );

    await expect(apiService.login('a@b.com', 'wrong')).rejects.toThrow('Invalid email or password');

    // /auth/login is a public endpoint: a 401 there is a credential failure,
    // not a session expiration, so no logout/session-expired side effects fire.
    expect(sessionExpired).not.toHaveBeenCalled();
    expect(apiService.getToken()).toBe('someone-elses-token');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('G. an invalid restored token results in a cleared, unauthenticated session', async () => {
    await AsyncStorage.setItem('auth_token', 'expired-token');
    apiService.setToken('expired-token');

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(401, { error: 'Invalid token' }));

    await expect(apiService.getProfile()).rejects.toThrow('Invalid token');

    expect(apiService.isAuthenticated()).toBe(false);
    expect(await AsyncStorage.getItem('auth_token')).toBeNull();
  });

  test('H. a valid restored token successfully restores the profile', async () => {
    await AsyncStorage.setItem('auth_token', 'valid-token');
    apiService.setToken('valid-token');

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(200, { user: { id: '1', role: 'citizen' } })
    );

    const result = await apiService.getProfile();

    expect(result.data.user).toEqual({ id: '1', role: 'citizen' });
    expect(apiService.isAuthenticated()).toBe(true);
  });

  test('M. login response passes mustChangePassword through unchanged', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(200, {
        user: { id: '1', email: 'a@b.com', name: 'A', role: 'responder', verified: true },
        token: 'tok',
        mustChangePassword: true,
      })
    );

    const result = await apiService.login('a@b.com', 'pw');

    expect(result.data?.mustChangePassword).toBe(true);
  });
});
