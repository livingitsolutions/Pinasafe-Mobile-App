export interface LiveTrackingMapProps {
  emergencyId: string;
  incidentLocation: {
    latitude: number;
    longitude: number;
  };
  incidentType: string;
  onClose?: () => void;
}

export interface ResponderLocation {
  id: string;
  latitude: string | number;
  longitude: string | number;
  speed?: number;
  heading?: number;
  user?: {
    name?: string;
  };
}
