import { Platform } from 'react-native';
import { OrganizationAlertService } from '../services/organizationAlertService';
import { apiService } from '../services/apiService';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('../services/apiService', () => ({ apiService: { getOrganizations: jest.fn() } }));
jest.mock('../services/AudioAlertService', () => ({ audioAlertService: {} }));

const getOrganizations = apiService.getOrganizations as jest.Mock;

describe('organization alert SSR initialization', () => {
  test('does not access the API during module construction without window', () => {
    expect(getOrganizations).not.toHaveBeenCalled();
  });

  test.each(['android', 'ios'])('initializes organizations on %s', platform => {
    (Platform as { OS: string }).OS = platform;
    getOrganizations.mockResolvedValueOnce({ data: { data: [] } });
    new OrganizationAlertService();
    expect(getOrganizations).toHaveBeenCalledTimes(1);
    getOrganizations.mockClear();
  });
});
