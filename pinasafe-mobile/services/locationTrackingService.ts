import * as Location from 'expo-location';
import { apiService } from './apiService';

class LocationTrackingService {
  private trackingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private watchSubscriptions: Map<string, Location.LocationSubscription> = new Map();

  async startTracking(emergencyId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return { success: false, error: 'Location permission denied' };
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const response = await apiService.startLocationTracking(
        emergencyId,
        location.coords.latitude,
        location.coords.longitude,
        location.coords.accuracy || undefined
      );

      if (response.error) {
        return { success: false, error: response.error };
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (newLocation) => {
          this.updateLocation(emergencyId, newLocation);
        }
      );

      this.watchSubscriptions.set(emergencyId, subscription);

      return { success: true };
    } catch (error) {
      console.error('Start tracking error:', error);
      return { success: false, error: 'Failed to start tracking' };
    }
  }

  private async updateLocation(emergencyId: string, location: Location.LocationObject) {
    try {
      await apiService.updateLocation(emergencyId, {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        speed: location.coords.speed || 0,
        heading: location.coords.heading || undefined,
        accuracy: location.coords.accuracy || undefined,
      });
    } catch (error) {
      console.error('Update location error:', error);
    }
  }

  async stopTracking(emergencyId: string): Promise<void> {
    try {
      const subscription = this.watchSubscriptions.get(emergencyId);
      if (subscription) {
        subscription.remove();
        this.watchSubscriptions.delete(emergencyId);
      }

      const interval = this.trackingIntervals.get(emergencyId);
      if (interval) {
        clearInterval(interval);
        this.trackingIntervals.delete(emergencyId);
      }

      await apiService.stopLocationTracking(emergencyId);
    } catch (error) {
      console.error('Stop tracking error:', error);
    }
  }

  async getEmergencyLocations(emergencyId: string) {
    try {
      const response = await apiService.getEmergencyLocations(emergencyId);
      return response.data || [];
    } catch (error) {
      console.error('Get emergency locations error:', error);
      return [];
    }
  }

  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  formatDistance(distance: number): string {
    if (distance < 1) {
      return `${Math.round(distance * 1000)}m`;
    }
    return `${distance.toFixed(1)}km`;
  }

  calculateETAMinutes(distance: number, speed: number): number {
    if (speed <= 0) {
      const averageSpeed = 40;
      return Math.round((distance / averageSpeed) * 60);
    }
    return Math.round((distance / speed) * 60);
  }

  formatETA(minutes: number): string {
    if (minutes < 1) {
      return 'Arriving now';
    }
    if (minutes === 1) {
      return '1 minute';
    }
    if (minutes < 60) {
      return `${minutes} minutes`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    return `${hours} hour${hours > 1 ? 's' : ''} ${mins} min`;
  }
}

export const locationTrackingService = new LocationTrackingService();
