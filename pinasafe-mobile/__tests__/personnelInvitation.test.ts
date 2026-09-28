import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, apiService } from '../services/apiService';
import {
  buildPersonnelInvitationUrl,
  createInvitationAcceptanceController,
  createPersonnelInvitationResult,
  getInvitationAcceptanceError,
} from '../utils/personnelInvitation';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

const jsonResponse = (status: number, body: unknown): Response => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
} as Response);

describe('personnel invitation completion flow', () => {
  const originalApiURL = process.env.EXPO_PUBLIC_API_URL;

  beforeEach(async () => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
    process.env.EXPO_PUBLIC_API_URL = 'https://pinasafe-test-api.example.com';
    // @ts-expect-error test mock helper
    AsyncStorage.__resetMockStorage?.();
    await apiService.clearLocalSession();
    apiService.onSessionExpired(null);
  });

  afterAll(() => {
    if (originalApiURL === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = originalApiURL;
  });

  test('A/B. issuance result keeps the token only inside the immediate acceptance URL', () => {
    const result = createPersonnelInvitationResult(
      { email: 'responder@example.com', invitationToken: 'private token' },
      'https://app.example.com/'
    );

    expect(result).toEqual({
      email: 'responder@example.com',
      url: 'https://app.example.com/accept-personnel-invitation?token=private%20token',
    });
    expect(result).not.toHaveProperty('invitationToken');
    expect(buildPersonnelInvitationUrl('https://app.example.com', 'abc')).toContain(
      '/accept-personnel-invitation?token=abc'
    );
  });

  test('C/D. acceptance uses the exact public endpoint and token + password body', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, { message: 'Accepted' }));

    await apiService.acceptPersonnelInvitation('invite-token', 'securepass');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://pinasafe-test-api.example.com/api/auth/personnel-invitations/accept',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'invite-token', password: 'securepass' }),
      })
    );
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      token: 'invite-token',
      password: 'securepass',
    });
  });

  test('E. mismatched passwords are rejected before an API request', async () => {
    const accept = jest.fn();
    const controller = createInvitationAcceptanceController(accept);
    await expect(controller.submit('token', 'securepass', 'different')).resolves.toBe(false);
    expect(controller.state.validationError).toBe('Passwords do not match.');
    expect(accept).not.toHaveBeenCalled();
  });

  test('F. too-short passwords are rejected before an API request', async () => {
    const accept = jest.fn();
    const controller = createInvitationAcceptanceController(accept);
    await controller.submit('token', 'short', 'short');
    expect(controller.state.validationError).toContain('at least 8 characters');
    expect(accept).not.toHaveBeenCalled();
  });

  test('G. a duplicate submission is prevented while the first is pending', async () => {
    let resolve!: () => void;
    const accept = jest.fn(() => new Promise<void>(done => { resolve = done; }));
    const controller = createInvitationAcceptanceController(accept);
    const first = controller.submit('token', 'securepass', 'securepass');
    await expect(controller.submit('token', 'securepass', 'securepass')).resolves.toBe(false);
    expect(accept).toHaveBeenCalledTimes(1);
    resolve();
    await expect(first).resolves.toBe(true);
  });

  test.each([
    [400, 'invalid'],
    [409, 'unavailable'],
    [410, 'expired'],
  ] as const)('H/I/J. status %i maps to safe state %s', (status, expected) => {
    expect(getInvitationAcceptanceError(new ApiError(status, 'server detail'))).toBe(expected);
  });

  test('K. successful acceptance produces login-next state', async () => {
    const controller = createInvitationAcceptanceController(jest.fn().mockResolvedValue({}));
    await expect(controller.submit('token', 'securepass', 'securepass')).resolves.toBe(true);
    expect(controller.state.accepted).toBe(true);
  });

  test('L. public acceptance 401 does not expire an authenticated session', async () => {
    apiService.setToken('existing-session');
    const sessionExpired = jest.fn();
    apiService.onSessionExpired(sessionExpired);
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(401, { error: 'Invalid invitation' }));

    await expect(apiService.acceptPersonnelInvitation('bad', 'securepass')).rejects.toThrow();

    expect(sessionExpired).not.toHaveBeenCalled();
    expect(apiService.getToken()).toBe('existing-session');
  });
});
