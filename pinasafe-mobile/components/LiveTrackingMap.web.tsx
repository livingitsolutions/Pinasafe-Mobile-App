import { apiService } from '@/services/apiService';
import { locationTrackingService } from '@/services/locationTrackingService';
import { Clock, MapPin, Navigation, Users } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import type { LiveTrackingMapProps, ResponderLocation } from './LiveTrackingMap.types';

export const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({
  emergencyId,
  incidentLocation,
  incidentType,
  onClose,
}) => {
  const [teamLocations, setTeamLocations] = useState<ResponderLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadLocations = async () => {
      try {
        const response = await apiService.getEmergencyLocations(emergencyId);
        if (active && Array.isArray(response.data)) {
          setTeamLocations(response.data);
        }
      } catch (error) {
        console.error('Load locations error:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadLocations();
    const pollInterval = window.setInterval(loadLocations, 5000);

    return () => {
      active = false;
      window.clearInterval(pollInterval);
    };
  }, [emergencyId]);

  const responders = useMemo(
    () => teamLocations.map((responder) => {
      const distance = locationTrackingService.calculateDistance(
        incidentLocation.latitude,
        incidentLocation.longitude,
        Number(responder.latitude),
        Number(responder.longitude),
      );
      const eta = locationTrackingService.calculateETAMinutes(distance, responder.speed || 40);

      return {
        ...responder,
        distance: locationTrackingService.formatDistance(distance),
        eta: locationTrackingService.formatETA(eta),
      };
    }),
    [incidentLocation.latitude, incidentLocation.longitude, teamLocations],
  );

  return (
    <View className="flex-1 bg-slate-100 p-4">
      <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <View className="mb-2 flex-row items-center">
              <View className="mr-3 rounded-full bg-red-100 p-2">
                <MapPin size={22} color="#DC2626" />
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold text-slate-900">{incidentType} incident</Text>
                <Text className="text-sm text-slate-600">
                  {incidentLocation.latitude.toFixed(5)}, {incidentLocation.longitude.toFixed(5)}
                </Text>
              </View>
            </View>
            <Text className="text-sm text-slate-600">
              Live responder information is available below. Interactive web mapping is coming in a later PWA update.
            </Text>
          </View>
          {onClose && (
            <TouchableOpacity onPress={onClose} className="rounded-lg bg-slate-100 px-3 py-2">
              <Text className="font-semibold text-slate-700">Close</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View className="mt-4 flex-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <View className="mb-4 flex-row items-center">
          <Users size={20} color="#2563EB" />
          <Text className="ml-2 text-base font-bold text-slate-900">Responders en route</Text>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center py-8">
            <ActivityIndicator size="large" color="#2563EB" />
            <Text className="mt-3 text-slate-600">Loading live tracking...</Text>
          </View>
        ) : responders.length === 0 ? (
          <View className="items-center py-8">
            <Clock size={30} color="#D97706" />
            <Text className="mt-3 text-center font-medium text-amber-800">
              Waiting for the response team to begin sharing its location.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {responders.map((responder) => (
              <View key={responder.id} className="flex-row items-center rounded-xl bg-blue-50 p-4">
                <View className="mr-3 rounded-full bg-blue-600 p-2">
                  <Navigation size={18} color="#FFFFFF" />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-slate-900">{responder.user?.name || 'Responder'}</Text>
                  <Text className="text-sm text-slate-600">{responder.distance} away · ETA {responder.eta}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};
