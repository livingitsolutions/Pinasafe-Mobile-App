import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Linking, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Radio, MapPin, Clock, AlertTriangle, Phone, Navigation } from 'lucide-react-native';
import { useEmergency } from '@/contexts/EmergencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { locationService } from '@/hooks/locationService';
import { organizationAlertService } from '@/services/organizationAlertService';
import { router } from 'expo-router';
import { IncidentAlertNotification } from '@/components/IncidentAlertNotification';
import { apiService } from '@/services/apiService';

const ResponderDispatch: React.FC = () => {
  const { reports, updateReportStatus, getClusteredIncidents } = useEmergency();
  const { user } = useAuth();
  const clusteredIncidents = getClusteredIncidents();
  const [teamData, setTeamData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

 
  useEffect(() => {
    loadTeamData();
  }, [user]);

  const loadTeamData = async () => {
    try {
      setLoading(true);
      if (!user?.teamId) {
        setTeamData(null);
        setLoading(false);
        return;
      }

      const response = await apiService.getTeams();
      const teams = response?.data?.data || [];
      const myTeam = teams.find((t: any) => t.id === user.teamId);

      setTeamData(myTeam || null);
    } catch (error) {
      console.error('Error loading team data:', error);
    } finally {
      setLoading(false);
    }
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

  const calculateDistance = (report: any): string => {
    if (report.coordinates) {
      // In a real app, you'd get responder's current location
      // For now, using Hilongos center as responder location
      const responderLat = 10.3929;
      const responderLon = 124.7544;
      
      const distance = locationService.calculateDistance(
        responderLat,
        responderLon,
        report.coordinates.latitude,
        report.coordinates.longitude
      );
      
      return locationService.formatDistance(distance);
    }
    return '1.2 km'; // Fallback
  };

  const activeIncidents = clusteredIncidents
    .filter(cluster => cluster.status === 'pending' || cluster.status === 'dispatched')
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .map(cluster => ({
      ...cluster,
      type: `${cluster.type.charAt(0).toUpperCase() + cluster.type.slice(1)} ${cluster.totalReports > 1 ? 'Emergency Cluster' : 'Emergency'}`,
      distance: calculateDistance(cluster.primaryIncident),
      time: getTimeAgo(cluster.lastUpdated),
      status: cluster.status === 'pending' ? 'Available' : 'Dispatched',
      description: cluster.totalReports > 1
        ? `${cluster.totalReports} related ${cluster.type} incidents in ${cluster.affectedArea}`
        : cluster.primaryIncident.description,
    }));

  const myActiveIncidents = clusteredIncidents
    .filter(cluster => {
      const primary = cluster.primaryIncident as any;
      return cluster.status === 'responding' && primary.assigned_team_id === user?.teamId;
    })
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .map(cluster => ({
      ...cluster,
      type: `${cluster.type.charAt(0).toUpperCase() + cluster.type.slice(1)} ${cluster.totalReports > 1 ? 'Emergency Cluster' : 'Emergency'}`,
      distance: calculateDistance(cluster.primaryIncident),
      time: getTimeAgo(cluster.lastUpdated),
      description: cluster.totalReports > 1
        ? `${cluster.totalReports} related ${cluster.type} incidents in ${cluster.affectedArea}`
        : cluster.primaryIncident.description,
    }));

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Available':
        return 'bg-green-100 text-green-800';
      case 'Dispatched':
        return 'bg-blue-100 text-blue-800';
      case 'Responding':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

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
              Alert.alert('Success', 'Incident marked as resolved.');
            } catch (error) {
              Alert.alert('Error', 'Failed to resolve incident.');
            }
          },
        },
      ]
    );
  };

  const handleAcceptIncident = async (incident: any) => {
    try {
      await apiService.assignTeamToReport(incident.id, user?.teamId);
      await updateReportStatus(incident.id, 'responding');
      Alert.alert('Success', 'You / Your Team have accepted the incident.');
    } catch (error) {
      Alert.alert('Error', 'Failed to accept incident.');
    }  
  };       

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTeamData().then(() => setRefreshing(false));
  }, []);





  const handleNavigate = (incident: any) => {
    const coords = incident.primaryIncident?.coordinates || incident.coordinates;
    if (coords) {
      router.push('/(tabs-responder)/map');
    } else {
      Alert.alert('Error', 'Location coordinates not available for navigation.');
    }
  };

  
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <IncidentAlertNotification />
      <ScrollView
        className="flex-1"
        refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#9333EA']} />
        }
        >
        {/* Header */}
        <View className="bg-white px-6 py-6 shadow-sm">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-2xl font-bold text-gray-900">Dispatch</Text>
              <Text className="text-gray-600 mt-1">Active emergency calls</Text>
            </View>
            <View className="bg-green-100 p-3 rounded-full">
              <Radio size={24} color="#059669" strokeWidth={1.5} />
            </View>
          </View>
        </View>

        {/* Status Card */}
        <View className="mx-6 mt-4">
          <View className="gap-y-4">
            <View className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-lg font-bold text-gray-900">On Duty</Text>
                  <Text className="text-green-600 font-medium">Available for dispatch</Text>
                </View>
                <View className="w-4 h-4 bg-green-500 rounded-full" />
              </View>
            </View>
            
            {/* Organization Status */}
            {/* <View className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <Text className="font-semibold text-gray-900 mb-2">Team Readiness</Text>
              <View className="flex-row justify-between">
                {Object.values(orgStats).slice(0, 2).map((org: any, index) => (
                  <View key={index} className="flex-1 mr-2 last:mr-0">
                    <Text className="text-xs text-gray-600 mb-1">{org.name.split(' - ')[0]}</Text>
                    <Text className="text-sm font-medium text-gray-900">{org.onDuty + org.available}/{org.total}</Text>
                  </View>
                ))}
              </View>
            </View> */}
          </View>
        </View>

        {/* My Active Incidents (Responding) */}
        {myActiveIncidents.length > 0 && (
          <View className="px-6 mt-6">
            <Text className="text-lg font-bold text-gray-900 mb-3">My Active Incidents</Text>
            <View className="gap-y-4">
              {myActiveIncidents.map((incident) => (
                <View
                  key={incident.id}
                  className="bg-amber-50 rounded-xl p-4 shadow-sm border-2 border-amber-500"
                >
                  <View className="flex-row items-start justify-between mb-3">
                    <View className="flex-1">
                      <View className="flex-row items-center mb-2">
                        <View className={`w-3 h-3 rounded-full ${getPriorityColor(incident.priority)} mr-2`} />
                        <Text className="font-bold text-gray-900">{incident.type}</Text>
                        {incident.totalReports > 1 && (
                          <View className="bg-blue-100 px-2 py-1 rounded-full ml-2">
                            <Text className="text-blue-800 text-xs font-medium">{incident.totalReports} reports</Text>
                          </View>
                        )}
                        <View className="ml-2 px-2 py-1 rounded-full bg-amber-100">
                          <Text className="text-xs font-medium text-amber-800">Responding</Text>
                        </View>
                      </View>
                      <Text className="text-gray-600 mb-2">{incident.description}</Text>
                    </View>
                  </View>

                  <View className="gap-y-2 mb-4">
                    <View className="flex-row items-center">
                      <MapPin size={14} color="#6B7280" strokeWidth={1.5} />
                      <Text className="ml-2 text-sm text-gray-600">{incident.affectedArea}</Text>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center">
                        <Clock size={14} color="#6B7280" strokeWidth={1.5} />
                        <Text className="ml-2 text-sm text-gray-600">{incident.time}</Text>
                      </View>
                      <Text className="text-sm text-gray-600">{incident.distance} away</Text>
                    </View>
                  </View>

                  <View className="flex-row gap-x-6">
                    <TouchableOpacity
                      className="flex-1 bg-green-600 py-3 rounded-lg flex-row items-center justify-center"
                      onPress={() => handleResolveIncident(incident)}
                    >
                      <Text className="text-white font-semibold">Mark as Resolved</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-1 bg-blue-600 py-3 rounded-lg flex-row items-center justify-center"
                      onPress={() => handleNavigate(incident)}
                    >
                      <Navigation size={16} color="#FFFFFF" strokeWidth={1.5} />
                      <Text className="text-white font-semibold ml-2">Navigate</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Available Incidents */}
        <View className="px-6 mt-6">
          <Text className="text-lg font-bold text-gray-900 mb-3">Available Incidents</Text>
          <View className="gap-y-4">
            {activeIncidents.map((incident) => (
              <View
                key={incident.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
              >
                <View className="flex-row items-start justify-between mb-3">
                  <View className="flex-1">
                    <View className="flex-row items-center mb-2">
                      <View className={`w-3 h-3 rounded-full ${getPriorityColor(incident.priority)} mr-2`} />
                      <Text className="font-bold text-gray-900">{incident.type}</Text>
                      {incident.totalReports > 1 && (
                        <View className="bg-blue-100 px-2 py-1 rounded-full ml-2">
                          <Text className="text-blue-800 text-xs font-medium">{incident.totalReports} reports</Text>
                        </View>
                      )}
                      <View className={`ml-2 px-2 py-1 rounded-full ${getStatusColor(incident.status)}`}>
                        <Text className="text-xs font-medium">{incident.status}</Text>
                      </View>
                    </View>
                    <Text className="text-gray-600 mb-2">{incident.description}</Text>
                  </View>
                </View>

                <View className="gap-y-2 mb-4">
                  <View className="flex-row items-center">
                    <MapPin size={14} color="#6B7280" strokeWidth={1.5} />
                    <Text className="ml-2 text-sm text-gray-600">{incident.affectedArea}</Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center">
                      <Clock size={14} color="#6B7280" strokeWidth={1.5} />
                      <Text className="ml-2 text-sm text-gray-600">{incident.time}</Text>
                    </View>
                    <Text className="text-sm text-gray-600">{incident.distance} away</Text>
                  </View>
                </View>

                {/* Action Buttons */}
                <View className="flex-row ">
                  {incident.status === 'Available' && (
                    <TouchableOpacity 
                      className="flex-1 bg-green-600 py-3 rounded-lg flex-row items-center justify-center"
                      onPress={() => handleAcceptIncident(incident)}
                    >
                      <Radio size={16} color="#FFFFFF" strokeWidth={1.5} />
                      <Text className="text-white font-semibold ml-2">Accept</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
            {activeIncidents.length === 0 && (
              <View className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 items-center">
                <Radio size={48} color="#D1D5DB" strokeWidth={1.5} />
                <Text className="text-gray-500 font-medium mt-4 mb-2">No Active Incident Clusters</Text>
                <Text className="text-gray-400 text-center text-sm">
                  All incident clusters have been handled. Stay ready for new emergencies.
                </Text>
              </View>
            )}
          </View>
        </View>

        
      </ScrollView>
    </SafeAreaView>
  );
}

export default React.memo(ResponderDispatch);