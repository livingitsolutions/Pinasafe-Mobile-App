import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { Navigation, MapPin, Users, Clock, Flame, Car, Siren, Zap, AlertTriangle, Droplets, Wind, House } from 'lucide-react-native';
import { apiService } from '@/services/apiService';
import { locationTrackingService } from '@/services/locationTrackingService';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import type { LiveTrackingMapProps } from './LiveTrackingMap.types';

export const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({
  emergencyId,
  incidentLocation,
  incidentType,
  onClose,
}) => {
  const [teamLocations, setTeamLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [closestResponder, setClosestResponder] = useState<any>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const mapRef = useRef<MapView>(null);
  // Fix pollInterval type for React Native
  const pollInterval = useRef<number | null>(null);
  const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Move helpers above usage
  const getIncidentIcon = (type: string) => {
    const normalizedType = type?.toLowerCase() || '';
    if (normalizedType.includes('fire')) {
      return { Icon: Flame, color: '#EF4444', bgColor: '#FEE2E2' };
    } else if (normalizedType.includes('accident') || normalizedType.includes('road') || normalizedType.includes('vehicle') || normalizedType.includes('collision')) {
      return { Icon: Car, color: '#F59E0B', bgColor: '#FEF3C7' };
    } else if (normalizedType.includes('medical') || normalizedType.includes('health')) {
      return { Icon: Siren, color: '#DC2626', bgColor: '#FEE2E2' };
    } else if (normalizedType.includes('crime') || normalizedType.includes('robbery') || normalizedType.includes('theft')) {
      return { Icon: AlertTriangle, color: '#7C3AED', bgColor: '#EDE9FE' };
    } else if (normalizedType.includes('flood') || normalizedType.includes('water')) {
      return { Icon: Droplets, color: '#2563EB', bgColor: '#DBEAFE' };
    } else if (normalizedType.includes('storm') || normalizedType.includes('typhoon')) {
      return { Icon: Wind, color: '#6B7280', bgColor: '#F3F4F6' };
    } else if (normalizedType.includes('earthquake') || normalizedType.includes('disaster')) {
      return { Icon: House, color: '#B45309', bgColor: '#FED7AA' };
    } else if (normalizedType.includes('power') || normalizedType.includes('electricity')) {
      return { Icon: Zap, color: '#FBBF24', bgColor: '#FEF3C7' };
    }
    return { Icon: AlertTriangle, color: '#EF4444', bgColor: '#FEE2E2' };
  };
  // Removed duplicate definition of getIncidentIcon

  const getETAInfo = () => {
    if (!closestResponder) return null;
    const distance = locationTrackingService.calculateDistance(
      incidentLocation.latitude,
      incidentLocation.longitude,
      parseFloat(closestResponder.latitude),
      parseFloat(closestResponder.longitude)
    );
    const speed = closestResponder.speed || 40;
    const eta = locationTrackingService.calculateETAMinutes(distance, speed);
    return {
      distance: locationTrackingService.formatDistance(distance),
      eta: locationTrackingService.formatETA(eta),
      responderName: closestResponder.user?.name || 'Responder',
    };
  };
  // Removed duplicate definition of getETAInfo

  const etaInfo = getETAInfo();
  const incidentIconData = getIncidentIcon(incidentType);
  const IncidentIcon = incidentIconData.Icon;
  const initialRegion = useMemo(() => {
    if (teamLocations && teamLocations.length > 0) {
      const coords = [
        { latitude: incidentLocation.latitude, longitude: incidentLocation.longitude },
        ...teamLocations.map(loc => ({ latitude: parseFloat(loc.latitude), longitude: parseFloat(loc.longitude) })),
      ];

      let minLat = coords[0].latitude;
      let maxLat = coords[0].latitude;
      let minLng = coords[0].longitude;
      let maxLng = coords[0].longitude;

      for (const c of coords) {
        if (c.latitude < minLat) minLat = c.latitude;
        if (c.latitude > maxLat) maxLat = c.latitude;
        if (c.longitude < minLng) minLng = c.longitude;
        if (c.longitude > maxLng) maxLng = c.longitude;
      }

      const latitude = (minLat + maxLat) / 2;
      const longitude = (minLng + maxLng) / 2;

      const latitudeDelta = Math.max(0.005, (maxLat - minLat) * 1.4);
      const longitudeDelta = Math.max(0.005, (maxLng - minLng) * 1.4);

      return { latitude, longitude, latitudeDelta, longitudeDelta };
    }
    return {
      latitude: incidentLocation.latitude,
      longitude: incidentLocation.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }, [incidentLocation, teamLocations]);

  useEffect(() => {
    loadLocations();
    pollInterval.current = setInterval(() => {
      loadLocations();
    }, 5000) as unknown as number;
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, [emergencyId]);

  const loadLocations = async () => {
    try {
      const response = await apiService.getEmergencyLocations(emergencyId);
      if (response.data) {
        setTeamLocations(response.data);
        if (response.data.length > 0) {
          const closest = response.data.reduce((prev: any, current: any) => {
            const prevDist = locationTrackingService.calculateDistance(
              incidentLocation.latitude,
              incidentLocation.longitude,
              prev.latitude,
              prev.longitude
            );
            const currentDist = locationTrackingService.calculateDistance(
              incidentLocation.latitude,
              incidentLocation.longitude,
              current.latitude,
              current.longitude
            );
            return currentDist < prevDist ? current : prev;
          });
          setClosestResponder(closest);
          fitMapToMarkers();
        }
      }
    } catch (error) {
      console.error('Load locations error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fitMapToMarkers = () => {
    if (mapRef.current && teamLocations && teamLocations.length > 0) {
      const coordinates = [
        incidentLocation,
        ...teamLocations.map(loc => ({
          latitude: parseFloat(loc.latitude),
          longitude: parseFloat(loc.longitude),
        })),
      ];
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 100, right: 50, bottom: 100, left: 50 },
        animated: true,
      });
    }
  };


  // Now safe to do conditional returns
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="mt-4 text-gray-600">Loading live tracking...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        showsPointsOfInterest={false}
        showsUserLocation={true}
        showsMyLocationButton={true}
        showsTraffic={true}
        showsBuildings={true}
        showsIndoors={true}
        loadingEnabled={true}
        minZoomLevel={15}
        maxZoomLevel={20}
        pitchEnabled={true}
        rotateEnabled={true}
        scrollEnabled={true}
        zoomEnabled={true}
      >
        <Marker
          coordinate={incidentLocation}
          title={`${incidentType} Emergency`}
          description="Incident Location"
        >
          <View className="items-center">
            <View
              style={{
                backgroundColor: incidentIconData.color,
                padding: 12,
                borderRadius: 50,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 3.84,
                elevation: 5,
              }}
            >
              <IncidentIcon size={12} color="#FFFFFF" strokeWidth={2.5} />
            </View>
            <View
              style={{
                backgroundColor: incidentIconData.bgColor,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
                marginTop: 4,
                borderWidth: 1,
                borderColor: incidentIconData.color,
              }}
            >
              <Text style={{ color: incidentIconData.color, fontSize: 10, fontWeight: '600' }}>
                {incidentType.toUpperCase()}
              </Text>
            </View>
          </View>
        </Marker>

        <Circle
          center={incidentLocation}
          radius={100}
          strokeColor="rgba(239, 68, 68, 0.5)"
          fillColor="rgba(239, 68, 68, 0.1)"
        />

        {teamLocations && teamLocations.length > 0 && teamLocations.map((location, index) => (
          <React.Fragment key={location.id}>
            <Marker
              coordinate={{
                latitude: parseFloat(location.latitude),
                longitude: parseFloat(location.longitude),
              }}
              title={location.user?.name || 'Responder'}
              description={`Speed: ${Math.round(location.speed || 0)} km/h`}
            >
              <View className="items-center">
                <View className="bg-blue-600 p-3 rounded-full shadow-lg">
                  <Navigation
                    size={20}
                    color="#FFFFFF"
                    strokeWidth={2}
                    style={{
                      transform: [{ rotate: `${location.heading || 0}deg` }],
                    }}
                  />
                </View>
                <Text className="text-xs font-medium text-gray-900 mt-1 bg-white px-2 py-1 rounded shadow">
                  {location.user?.name}
                </Text>
              </View>
            </Marker>

            {MapViewDirections && index === 0 ? (
              <MapViewDirections
                origin={{
                  latitude: parseFloat(location.latitude),
                  longitude: parseFloat(location.longitude),
                }}
                destination={incidentLocation}
                apikey={GOOGLE_MAPS_API_KEY}
                strokeWidth={4}
                strokeColor="#3B82F6"
                optimizeWaypoints={true}
                onReady={(result: any) => {
                  setRouteDistance(result.distance);
                  setRouteDuration(result.duration);
                }}
                onError={(error: any) => {
                  console.warn('Directions error:', error);
                }}
              />
            ) : (
              <Polyline
                coordinates={[
                  {
                    latitude: parseFloat(location.latitude),
                    longitude: parseFloat(location.longitude),
                  },
                  incidentLocation,
                ]}
                strokeColor="#3B82F6"
                strokeWidth={3}
                lineDashPattern={[10, 5]}
              />
            )}
          </React.Fragment>
        ))}
      </MapView>

      {etaInfo && (
        <View className="absolute top-4 left-4 right-4 bg-white rounded-xl p-4 shadow-lg">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center">
              <View className="bg-green-100 p-2 rounded-full mr-3">
                <Users size={20} color="#16A34A" strokeWidth={2} />
              </View>
              <View>
                <Text className="text-sm text-gray-600">Response Team En Route</Text>
                <Text className="font-bold text-gray-900">{etaInfo.responderName}</Text>
              </View>
            </View>
            {onClose && (
              <TouchableOpacity onPress={onClose} className="p-2">
                <Text className="text-gray-600 font-medium">Close</Text>
              </TouchableOpacity>
            )}
          </View>

          <View className="flex-row items-center justify-between bg-gray-50 rounded-lg p-3">
            <View className="flex-row items-center flex-1">
              <MapPin size={16} color="#6B7280" strokeWidth={1.5} />
              <Text className="ml-2 text-sm text-gray-700">
                Distance: {routeDistance ? `${routeDistance.toFixed(1)} km` : etaInfo.distance}
              </Text>
            </View>
            <View className="flex-row items-center flex-1">
              <Clock size={16} color="#6B7280" strokeWidth={1.5} />
              <Text className="ml-2 text-sm text-gray-700">
                ETA: {routeDuration ? `${Math.round(routeDuration)} min` : etaInfo.eta}
              </Text>
            </View>
          </View>

          <View className="mt-3 flex-row items-center">
            <View className="w-2 h-2 bg-green-500 rounded-full mr-2" />
            <Text className="text-xs text-gray-600">Live tracking active</Text>
          </View>
        </View>
      )}

      {(!teamLocations || teamLocations.length === 0) && (
        <View className="absolute bottom-4 left-4 right-4 bg-amber-50 rounded-xl p-4 shadow-lg border border-amber-200">
          <View className="flex-row items-center">
            <Clock size={20} color="#F59E0B" strokeWidth={2} />
            <Text className="ml-3 text-amber-800 font-medium flex-1">
              Waiting for team to start responding...
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};
