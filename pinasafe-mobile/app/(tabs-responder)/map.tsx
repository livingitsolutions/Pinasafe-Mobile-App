import React, { useState, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Clock, CircleCheck as CheckCircle, ChevronDown, ChevronUp } from 'lucide-react-native';
import { LiveTrackingMap } from '@/components/LiveTrackingMap';
import { useEmergency } from '@/contexts/EmergencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/apiService';
import { getResponderLifecycleErrorMessage, runResponderLifecycle } from '@/utils/responderLifecycle';

function ResponderMap() {
  const { clusteredIncidents, refreshReports } = useEmergency();
  const { user } = useAuth();
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(true);
  const lifecycleLocks = useRef<Record<string, { current: boolean }>>({});
  const [updatingIncidentId, setUpdatingIncidentId] = useState<string | null>(null);

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
            const lock = lifecycleLocks.current[incident.id] || { current: false };
            lifecycleLocks.current[incident.id] = lock;
            try {
              setUpdatingIncidentId(incident.id);
              const result = await runResponderLifecycle({
                reportId: incident.id,
                currentStatus: 'responding',
                lock,
                update: (id, status) => apiService.updateResponderLifecycleStatus(id, status),
                refresh: refreshReports,
              });
              if (result === 'updated') {
                Alert.alert('Success', 'Incident marked as resolved.');
              }
            } catch (error) {
              Alert.alert('Unable to update incident', getResponderLifecycleErrorMessage(error));
            } finally {
              setUpdatingIncidentId(current => current === incident.id ? null : current);
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

                  <TouchableOpacity
                    className="bg-green-600 py-3 rounded-lg flex-row items-center justify-center"
                    onPress={() => handleResolveIncident(incident)}
                    disabled={updatingIncidentId === incident.id}
                  >
                    <CheckCircle size={16} color="#FFFFFF" />
                    <Text className="text-white font-semibold ml-2">
                      {updatingIncidentId === incident.id ? 'Updating…' : 'Mark Resolved'}
                    </Text>
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
