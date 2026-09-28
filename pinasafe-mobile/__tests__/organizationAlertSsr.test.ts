const getOrganizations = jest.fn();

jest.mock('../services/apiService', () => ({ apiService: { getOrganizations } }));
jest.mock('../services/AudioAlertService', () => ({ audioAlertService: {} }));
// Mocks must be declared before this side-effect import.
// eslint-disable-next-line import/first
import '../services/organizationAlertService';

describe('organization alert SSR initialization', () => {
  test('does not access the API during module construction without window', () => {
    expect(getOrganizations).not.toHaveBeenCalled();
  });
});
