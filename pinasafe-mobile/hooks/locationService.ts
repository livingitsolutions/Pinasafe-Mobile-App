import * as Location from 'expo-location';

export interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
}

export interface LocationData {
  coords: LocationCoords;
  timestamp: number;
  address?: string;
}

export interface LocationPermission {
  granted: boolean;
  canAskAgain: boolean;
  status: Location.PermissionStatus;
}

class LocationService {
  private watchId: Location.LocationSubscription | null = null;
  private lastKnownLocation: LocationData | null = null;

  async requestPermission(): Promise<LocationPermission> {
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      
      return {
        granted: status === Location.PermissionStatus.GRANTED,
        canAskAgain,
        status,
      };
    } catch (error) {
      console.error('Error requesting location permission:', error);
      return {
        granted: false,
        canAskAgain: false,
        status: Location.PermissionStatus.DENIED,
      };
    }
  }

  async getCurrentLocation(): Promise<LocationData> {
    try {
      const permission = await this.requestPermission();
      
      if (!permission.granted) {
        throw new Error('Location permission not granted');
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
      });

      const locationData: LocationData = {
        coords: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy ?? undefined,
          altitude: location.coords.altitude ?? undefined,
          heading: location.coords.heading ?? undefined,
          speed: location.coords.speed ?? undefined,
        },
        timestamp: location.timestamp,
      };

      // Get address for the location
      try {
        const address = await this.reverseGeocode(
          location.coords.latitude,
          location.coords.longitude
        );
        locationData.address = address;
      } catch (error) {
        console.warn('Failed to get address for location:', error);
      }

      this.lastKnownLocation = locationData;
      return locationData;
    } catch (error) {
      console.error('Error getting current location:', error);
      
      // Return last known location if available
      if (this.lastKnownLocation) {
        return this.lastKnownLocation;
      }
      
      // Fallback to Hilongos, Leyte coordinates
      return {
        coords: {
          latitude: 10.3929,
          longitude: 124.7544,
        },
        timestamp: Date.now(),
        address: 'Hilongos, Leyte, Philippines',
      };
    }
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<string> {
    try {
      const addresses = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (addresses && addresses.length > 0) {
        const address = addresses[0];
        const parts = [
          address.name,
          address.street,
          address.district,
          address.city,
          address.region,
          address.country,
        ].filter(Boolean);

        return parts.join(', ') || 'Unknown location';
      }

      return 'Unknown location';
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      return 'Unknown location';
    }
  }

  async startWatchingLocation(
    callback: (location: LocationData) => void,
    options?: {
      accuracy?: Location.Accuracy;
      timeInterval?: number;
      distanceInterval?: number;
    }
  ): Promise<boolean> {
    try {
      const permission = await this.requestPermission();
      
      if (!permission.granted) {
        return false;
      }

      this.watchId = await Location.watchPositionAsync(
        {
          accuracy: options?.accuracy || Location.Accuracy.High,
          timeInterval: options?.timeInterval || 10000,
          distanceInterval: options?.distanceInterval || 50,
        },
        async (location) => {
          const locationData: LocationData = {
            coords: {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                accuracy: location.coords.accuracy ?? undefined,
                altitude: location.coords.altitude ?? undefined,
                heading: location.coords.heading ?? undefined,
                speed: location.coords.speed ?? undefined,
            },
            timestamp: location.timestamp,
          };

          // Get address for the location
          try {
            const address = await this.reverseGeocode(
              location.coords.latitude,
              location.coords.longitude
            );
            locationData.address = address;
          } catch (error) {
            console.warn('Failed to get address for location:', error);
          }

          this.lastKnownLocation = locationData;
          callback(locationData);
        }
      );

      return true;
    } catch (error) {
      console.error('Error starting location watch:', error);
      return false;
    }
  }

  stopWatchingLocation(): void {
    if (this.watchId) {
      this.watchId.remove();
      this.watchId = null;
    }
  }

  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    // Haversine formula for calculating distance between two points
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  formatDistance(kilometers: number): string {
    if (kilometers < 1) {
      return `${Math.round(kilometers * 1000)}m`;
    }
    return `${kilometers.toFixed(1)}km`;
  }

  getLastKnownLocation(): LocationData | null {
    return this.lastKnownLocation;
  }

  async isLocationEnabled(): Promise<boolean> {
    try {
      return await Location.hasServicesEnabledAsync();
    } catch (error) {
      console.error('Error checking location services:', error);
      return false;
    }
  }
}

export const locationService = new LocationService();