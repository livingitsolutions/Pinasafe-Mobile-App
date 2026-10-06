import * as Location from 'expo-location';
import type { GeolocationSource } from '@/utils/liveTracking';

export const deviceGeolocationSource: GeolocationSource = {
  async requestPermission() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === Location.PermissionStatus.GRANTED;
  },
  async watch(onFix, onError) {
    const subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 0 },
      position => onFix({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: typeof position.coords.accuracy === 'number' ? position.coords.accuracy : null,
        timestamp: position.timestamp,
      }),
      reason => onError(typeof reason === 'string' && reason ? reason : 'Location services are unavailable.')
    );
    return () => subscription.remove();
  },
};
