import { locationService, LocationData } from '../hooks/locationService';

jest.mock('expo-location', () => {
  const mockLocation = {
    coords: { latitude: 10.5, longitude: 124.9, accuracy: 5 },
    timestamp: 1700000000000,
  };
  return {
    requestForegroundPermissionsAsync: jest.fn(),
    getCurrentPositionAsync: jest.fn(),
    reverseGeocodeAsync: jest.fn(),
    watchPositionAsync: jest.fn(),
    hasServicesEnabledAsync: jest.fn(),
    Accuracy: { High: 6 },
    PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
  };
});

describe('locationService — no fallback coordinates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns actual coordinates on success', async () => {
    const Location = require('expo-location');
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 10.5, longitude: 124.9, accuracy: 5 },
      timestamp: 1700000000000,
    });
    Location.reverseGeocodeAsync.mockResolvedValue([{ city: 'Test City' }]);

    const result = await locationService.getCurrentLocation();
    expect(result).not.toBeNull();
    expect(result!.coords.latitude).toBe(10.5);
    expect(result!.coords.longitude).toBe(124.9);
    expect(result!.coords.accuracy).toBe(5);
  });

  test('returns null on permission denied', async () => {
    const Location = require('expo-location');
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });

    const result = await locationService.getCurrentLocation();
    expect(result).toBeNull();
  });

  test('returns null on position unavailable', async () => {
    const Location = require('expo-location');
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    Location.getCurrentPositionAsync.mockRejectedValue(new Error('Position unavailable'));

    const result = await locationService.getCurrentLocation();
    expect(result).toBeNull();
  });

  test('returns null on timeout', async () => {
    const Location = require('expo-location');
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    Location.getCurrentPositionAsync.mockRejectedValue(new Error('Timeout'));

    const result = await locationService.getCurrentLocation();
    expect(result).toBeNull();
  });

  test('never returns Hilongos fallback coordinates', async () => {
    const Location = require('expo-location');
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });

    const result = await locationService.getCurrentLocation();
    expect(result).toBeNull();
    expect(result).not.toEqual(expect.objectContaining({
      coords: { latitude: 10.3929, longitude: 124.7544 },
    }));
  });

  test('returns null when geolocation is unsupported (throws)', async () => {
    const Location = require('expo-location');
    Location.requestForegroundPermissionsAsync.mockRejectedValue(new Error('Unsupported'));

    const result = await locationService.getCurrentLocation();
    expect(result).toBeNull();
  });
});
