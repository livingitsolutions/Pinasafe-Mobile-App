import { Platform } from 'react-native';
import { OrganizationAlertService } from '../services/organizationAlertService';
import { apiService } from '../services/apiService';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('../services/apiService', () => ({ apiService: { getOrganizations: jest.fn() } }));
jest.mock('../services/AudioAlertService', () => ({ audioAlertService: {} }));

const getOrganizations = apiService.getOrganizations as jest.Mock;

describe('organization alert SSR initialization', () => {
  beforeEach(() => {
    getOrganizations.mockClear();
  });

  test('does not call GET /organizations during module construction', () => {
    expect(getOrganizations).not.toHaveBeenCalled();
  });

  test.each(['android', 'ios', 'web'])('does not call GET /organizations on %s construction', () => {
    new OrganizationAlertService();
    expect(getOrganizations).not.toHaveBeenCalled();
  });

  test('initializeOrganizations calls GET /organizations when invoked explicitly', async () => {
    getOrganizations.mockResolvedValueOnce({ data: { data: [] } });
    const service = new OrganizationAlertService();
    await service.initializeOrganizations();
    expect(getOrganizations).toHaveBeenCalledTimes(1);
  });
});
