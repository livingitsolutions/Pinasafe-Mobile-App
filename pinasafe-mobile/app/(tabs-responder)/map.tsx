import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Layers, Search, Clock, CircleCheck as CheckCircle, Navigation as NavigationIcon, ChevronDown, ChevronUp } from 'lucide-react-native';
import { LiveTrackingMap } from '@/components/LiveTrackingMap';
import { useEmergency } from '@/contexts/EmergencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { locationService } from '@/hooks/locationService';
import { locationTrackingService } from '@/services/locationTrackingService';
import { apiService } from '@/services/apiService';

function ResponderMap() {
  const { clusteredIncidents, updateReportStatus } = useEmergency();
  const { user } = useAuth();
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(true);

  const myActiveClusters = useMemo(() => {
    return clusteredIncidents.filter(cluster => {
      const primary = cluster.primaryIncident as any;
      return cluster.status === 'responding' && primary.assigned_team_id === user?.teamId;
    });
  }, [clusteredIncidents, user?.teamId]);

  const myActiveIncidents = useMemo(() => {
    return myActiveClusters.map(cluster => {
      const incident = {
        ...cluster.primaryIncident,
        coordinates: cluster.coordinates || cluster.primaryIncident.coordinates,
        totalReports: cluster.totalReports,
      };

      if (!incident.coordinates) {
        console.warn('⚠️ Incident missing coordinates:', incident.id, incident.location);
      } else {
        console.log('✅ Incident with coordinates:', {
          id: incident.id,
          lat: incident.coordinates.latitude,
          lng: incident.coordinates.longitude,
        });
      }

      return incident;
    }).filter(incident => incident.coordinates);
  }, [myActiveClusters]);

  console.log('🗺️ Map Tab - Active Incidents with coords:', myActiveIncidents.length);

  const handleResolveIncident = async (incident: any) => {
    Alert.alert(
      'Resolve Incident',
      'Are you sure you want to mark this incident as resolved?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateReportStatus(incident.id, 'resolved', `Resolved by ${user?.name}`);
              setSelectedIncident(null);
              Alert.alert('Success', 'Incident marked as resolved.');
            } catch (error) {
              Alert.alert('Error', 'Failed to resolve incident.');
            }
          },
        },
      ]
    );
  };

  const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const reportTime = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - reportTime.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  };

  const [userLocation, setUserLocation] = useState<any>(null);
  const [incidentETAs, setIncidentETAs] = useState<Record<string, { eta: string; distance?: string }>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const loc = await locationService.getCurrentLocation();
        if (mounted) setUserLocation(loc);
      } catch (error) {
        console.warn('Failed to get user location for ETA:', error);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Fetch responder locations per incident to compute ETA (use closest responder)
  useEffect(() => {
    let mounted = true;
    let interval: NodeJS.Timeout | number | null = null;

    const fetchETAs = async () => {
      const etas: Record<string, { eta: string; distance?: string }> = {};

      // Group clusters by assigned team id to avoid duplicate requests
      const clustersByTeam: Record<string, any[]> = {};
      const unassignedClusters: any[] = [];

      for (const cluster of myActiveClusters) {
        const incident = cluster.primaryIncident as any;
        if (incident?.assigned_team_id) {
          clustersByTeam[incident.assigned_team_id] = clustersByTeam[incident.assigned_team_id] || [];
          clustersByTeam[incident.assigned_team_id].push(cluster);
        } else {
          unassignedClusters.push(cluster);
        }
      }

      // Fetch per-team locations once
      for (const teamId of Object.keys(clustersByTeam)) {
        const clusters = clustersByTeam[teamId];
        try {
          const resp = await apiService.getTeamLocations(teamId);
          const locations = resp.data || [];

          for (const cluster of clusters) {
            const incident = cluster.primaryIncident as any;
            const id = incident.id;
            if (!id || !incident.coordinates) continue;

            if (locations.length === 0) {
              etas[id] = { eta: 'Calculating...' };
              continue;
            }

            // find closest responder to incident
            let closest = locations[0];
            let closestDist = locationTrackingService.calculateDistance(
              incident.coordinates.latitude,
              incident.coordinates.longitude,
              parseFloat(closest.latitude),
              parseFloat(closest.longitude)
            );

            for (const loc of locations) {
              const dist = locationTrackingService.calculateDistance(
                incident.coordinates.latitude,
                incident.coordinates.longitude,
                parseFloat(loc.latitude),
                parseFloat(loc.longitude)
              );
              if (dist < closestDist) {
                closest = loc;
                closestDist = dist;
              }
            }

            const speedMps = closest.speed ?? 0;
            const speedKmh = speedMps > 0 ? speedMps * 3.6 : 0;
            const etaMinutes = locationTrackingService.calculateETAMinutes(closestDist, speedKmh);
            etas[id] = {
              eta: locationTrackingService.formatETA(etaMinutes),
              distance: locationTrackingService.formatDistance(closestDist),
            };
          }
        } catch (error) {
          console.warn('Failed to fetch team locations for team', teamId, error);
          for (const cluster of clusters) {
            const incident = cluster.primaryIncident as any;
            etas[incident.id] = { eta: 'Calculating...' };
          }
        }
      }

      // For clusters without an assigned team, compute ETA from device location when possible
      for (const cluster of unassignedClusters) {
        try {
          const incident = cluster.primaryIncident as any;
          const id = incident.id;
          if (!id || !incident.coordinates) continue;

          if (userLocation && userLocation.coords) {
            const distance = locationTrackingService.calculateDistance(
              userLocation.coords.latitude,
              userLocation.coords.longitude,
              incident.coordinates.latitude,
              incident.coordinates.longitude
            );
            const speedMps = userLocation.coords.speed ?? 0;
            const speedKmh = speedMps > 0 ? speedMps * 3.6 : 0;
            const etaMinutes = locationTrackingService.calculateETAMinutes(distance, speedKmh);
            etas[id] = { eta: locationTrackingService.formatETA(etaMinutes), distance: locationTrackingService.formatDistance(distance) };
          } else {
            etas[id] = { eta: 'Calculating...' };
          }
        } catch (error) {
          console.warn('Failed to set ETA for unassigned cluster', cluster, error);
        }
      }

      if (mounted) {
        setIncidentETAs(prev => {
          try {
            const prevStr = JSON.stringify(prev || {});
            const newStr = JSON.stringify(etas || {});
            if (prevStr === newStr) return prev;
          } catch (e) {
            // fallback to always set if stringify fails
          }
          return etas;
        });
      }
    };

    // initial fetch
    fetchETAs();

    // poll every 8 seconds while there are active clusters and the bottom sheet is open
    if (myActiveClusters.length > 0 && isBottomSheetOpen) {
      interval = setInterval(fetchETAs, 8000);
    }

    return () => {
      mounted = false;
      if (interval) clearInterval(interval as any);
    };
  }, [myActiveClusters, isBottomSheetOpen, userLocation]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top','left','right']}>
      {/* Map */}
      <View className="flex-1">
        {myActiveIncidents.length > 0 && myActiveIncidents[0]?.coordinates ? (
          <LiveTrackingMap
            emergencyId={myActiveIncidents[0].id}
            incidentLocation={{
              latitude: myActiveIncidents[0].coordinates.latitude,
              longitude: myActiveIncidents[0].coordinates.longitude,
            }}
            incidentType={myActiveIncidents[0].type || 'emergency'}
          />
        ) : (
          <View className="flex-1 bg-gray-200 relative">
            <View className="absolute inset-0 justify-center items-center">
              <MapPin size={64} color="#6B7280" strokeWidth={1.5} />
              <Text className="text-gray-600 mt-4 text-lg font-medium">
                {myActiveClusters.length > 0 ? 'Loading Map...' : 'No Active Incidents'}
              </Text>
              <Text className="text-gray-500 text-center px-8 mt-2">
                {myActiveClusters.length > 0
                  ? 'Waiting for incident location data'
                  : 'You have no incidents you\'re currently responding to. Check the Dispatch tab for available incidents.'}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Incident Details Bottom Sheet */}
      {myActiveClusters.length > 0 && (
        isBottomSheetOpen ? (
          <View className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl" style={{ maxHeight: '46%' }}>
          <View className="w-full flex-row justify-center items-center pt-2">
            <TouchableOpacity
              className="justify-center items-center p-2 bg-gray-300 rounded-full"
              onPress={() => setIsBottomSheetOpen(false)}
              accessibilityLabel="Collapse incident list"
            >
              <ChevronDown size={20} color="#374151" strokeWidth={1.5} />
            </TouchableOpacity>
          </View>

          <ScrollView className="px-6 py-0">
            <Text className="text-lg font-bold text-gray-900 mb-2">
              Active Incidents ({myActiveClusters.length})
            </Text>

            {myActiveClusters.map((cluster: any) => {
              const incident = cluster.primaryIncident;

              // Compute ETA using user's current location when available
              let etaText = 'Calculating...';
              if (incident.coordinates && userLocation && userLocation.coords) {
                try {
                  const distance = locationTrackingService.calculateDistance(
                    userLocation.coords.latitude,
                    userLocation.coords.longitude,
                    incident.coordinates.latitude,
                    incident.coordinates.longitude
                  );

                  // Expo speed is in meters/second; convert to km/h when available
                  const speedMps = userLocation.coords.speed ?? 0;
                  const speedKmh = speedMps > 0 ? speedMps * 3.6 : 0;

                  const etaMinutes = locationTrackingService.calculateETAMinutes(distance, speedKmh);
                  etaText = locationTrackingService.formatETA(etaMinutes);
                } catch (error) {
                  console.warn('ETA calculation failed for incident', incident.id, error);
                }
              }

              const displayEta = incidentETAs[incident.id]?.eta || etaText;

              return (
                <View key={incident.id} className="bg-amber-50 rounded-xl p-4 mb-3 border border-amber-200">
                  <View className="flex-row items-start justify-between mb-2">
                    <View className="flex-1">
                      <View className="flex-row items-center mb-2">
                        <Text className="font-bold text-gray-900 text-base">
                          {incident.type?.toUpperCase() || 'INCIDENT'}
                        </Text>
                        {cluster.totalReports > 1 && (
                          <View className="bg-blue-500 px-2 py-1 rounded-full ml-2">
                            <Text className="text-white text-xs font-bold">{cluster.totalReports} REPORTS</Text>
                          </View>
                        )}
                      </View>
                      <View className="flex-row items-center mb-2">
                        <MapPin size={14} color="#6B7280" />
                        <Text className="ml-1 text-sm text-gray-600">{incident.location}</Text>
                      </View>
                      <View className="flex-row items-center">
                        <Clock size={14} color="#6B7280" />
                        <Text className="ml-1 text-sm text-gray-600">
                          {getTimeAgo(incident.reportedAt || incident.created_at)}
                        </Text>
                      </View>
                    </View>
                    <View className="bg-amber-500 px-3 py-1 rounded-full">
                      <Text className="text-white text-xs font-bold">RESPONDING</Text>
                    </View>
                  </View>

                  {incident.description && (
                    <Text className="text-gray-700 text-sm mb-3">{incident.description}</Text>
                  )}

                  {/* ETA Information */}
                  {incident.coordinates && (
                    <View className="bg-blue-50 rounded-lg p-3 mb-3 border border-blue-200">
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center">
                          <NavigationIcon size={16} color="#2563EB" />
                          <Text className="ml-2 text-sm font-medium text-blue-900">En Route</Text>
                        </View>
                        <Text className="text-sm text-blue-700">ETA: {etaText}</Text>
                      </View>
                    </View>
                  )}

                  <TouchableOpacity
                    className="bg-green-600 py-3 rounded-lg flex-row items-center justify-center"
                    onPress={() => handleResolveIncident(incident)}
                  >
                    <CheckCircle size={16} color="#FFFFFF" />
                    <Text className="text-white font-semibold ml-2">Mark as Resolved</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>
        ) : (
          <View className="absolute bottom-0 left-0 right-0 items-center">
            <TouchableOpacity
              className="mt-2 mb-2 justify-center items-center p-2 bg-white rounded-t-full shadow-lg"
              onPress={() => setIsBottomSheetOpen(true)}
              accessibilityLabel="Expand incident list"
            >
              <ChevronUp size={20} color="#374151" strokeWidth={1.5} />
            </TouchableOpacity>
          </View>
        )
      )}
    </SafeAreaView>
  );
}

export default React.memo(ResponderMap);