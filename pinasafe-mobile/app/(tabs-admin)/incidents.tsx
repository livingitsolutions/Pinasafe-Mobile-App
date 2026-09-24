import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, MapPin, User, Plus, TriangleAlert as AlertTriangle, Layers, Send, X, Users } from 'lucide-react-native';
import { useEmergency } from '@/contexts/EmergencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/apiService';
import teamService from '@/services/teamService';

const AdminIncidents: React.FC = () => {
   const { reports, updateReportStatus } = useEmergency();
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [showClusterModal, setShowClusterModal] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<any>(null);
  const [clusterInfo, setClusterInfo] = useState<any>(null);
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateStatus, setUpdateStatus] = useState('responding');
  const [loading, setLoading] = useState(false);
  const [clusters, setClusters] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [availableTeams, setAvailableTeams] = useState<any[]>([]);
  const { user , authToken } = useAuth();

  useEffect(() => {
    if (!authToken) return;

    loadClusters();
    if (user?.organizationId) {
      loadTeams();
    }
  }, [user]);

  const loadClusters = async () => {
    try {
      const response = await apiService.getClusterStatistics();
      if (response.data) {
        console.log('Cluster statistics:', response.data);
      }
    } catch (error) {
      console.error('Error loading clusters:', error);
    }
  };

  const loadTeams = async () => {
    try {
      const teams = await teamService.getTeams();
      console.log('Loaded teams:', teams, 'Type:', typeof teams, 'IsArray:', Array.isArray(teams));
      setAvailableTeams(teams || []);
    } catch (error) {
      console.error('Error loading teams:', error);
      setAvailableTeams([]);
    }
  };

  const assignTeamToIncident = async (teamId: string) => {
    if (!selectedIncident) return;

    try {
      await apiService.assignTeamToReport(selectedIncident.id, teamId);
      Alert.alert('Success', 'Team assigned successfully');
      setShowTeamModal(false);
      setSelectedIncident(null);
      loadClusters();
    } catch (error) {
      console.error('Error assigning team:', error);
      Alert.alert('Error', 'Failed to assign team');
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadClusters();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const orgId = user?.organizationId;

  // First scope reports to the admin's organization (when available),
  // then apply the selected status filter.
  const filteredIncidents = reports
    .filter(report => {
      if (!orgId) return true; // if no orgId available, don't scope
      const r: any = report;
      // backend may return snake_case or camelCase
      return (r.organization_id === orgId || r.organizationId === orgId);
    })
    .filter(report => {
      if (selectedFilter === 'All') return true;
      return report.status.toLowerCase() === selectedFilter.toLowerCase();
    });

  const openClusterModal = async (incident: any) => {
    const clusterId = (incident as any).cluster_id || (incident as any).clusterId;
    if (clusterId) {
      setLoading(true);
      setShowClusterModal(true);
      try {
        const response = await apiService.getClusterInfo(clusterId);
        if (response.data) {
          setClusterInfo(response.data);
          setSelectedCluster(clusterId);
        }
      } catch (error) {
        console.error('Error loading cluster info:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const sendClusterUpdate = async () => {
    if (!selectedCluster || !updateMessage.trim()) {
      Alert.alert('Error', 'Please enter an update message');
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.createClusterUpdate(
        selectedCluster,
        updateMessage,
        updateStatus
      );

      if (response.data) {
        Alert.alert('Success', `Update sent to ${response.data.notifiedUsers} citizens`);
        setUpdateMessage('');
        setShowClusterModal(false);
        setClusterInfo(null);
      } else {
        Alert.alert('Error', response.error || 'Failed to send update');
      }
    } catch (error) {
      console.error('Error sending update:', error);
      Alert.alert('Error', 'Failed to send cluster update');
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-red-500';
      case 'responding':
        return 'bg-amber-500';
      case 'dispatched':
        return 'bg-blue-500';
      case 'resolved':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#9333EA']} />
        }
      >
        {/* Header */}
        <View className="bg-white px-6 py-6 shadow-sm flex-row justify-between items-center">
          <View>
            <Text className="text-2xl font-bold text-gray-900">Incidents</Text>
            <Text className="text-gray-600 mt-1">Manage emergency incidents</Text>
          </View>
        </View>

        {/* Filter Tabs */}
        <View className="px-6 mt-4">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-x-3">
              {['All', 'Pending', 'Dispatched', 'Responding', 'Resolved'].map((filter) => (
                <TouchableOpacity
                  key={filter}
                  onPress={() => setSelectedFilter(filter)}
                  className={`px-4 py-2 rounded-full ${
                    filter === selectedFilter ? 'bg-purple-600' : 'bg-gray-200'
                  }`}
                >
                  <Text className={`font-medium ${
                    filter === selectedFilter ? 'text-white' : 'text-gray-700'
                  }`}>
                    {filter}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Incidents List */}
        <View className="px-6 mt-6">
          <View className="gap-y-4">
            {filteredIncidents.map((incident) => (
              <TouchableOpacity
                key={incident.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
              >
                <View className="flex-row items-start justify-between mb-3">
                  <View className="flex-1">
                    <View className="flex-row items-center mb-2">
                      <View className={`w-3 h-3 rounded-full ${getStatusColor(incident.status)} mr-2`} />
                      <Text className="font-bold text-gray-900 capitalize">{incident.type} Emergency</Text>
                      <View className={`ml-2 px-2 py-1 rounded-full ${getPriorityColor(incident.priority)}`}>
                        <Text className="text-xs font-medium capitalize">{incident.priority}</Text>
                      </View>
                    </View>
                    {(incident as any).cluster_id || (incident as any).clusterId ? (
                      <TouchableOpacity
                        className="bg-blue-100 px-2 py-1 rounded-full self-start flex-row items-center mb-2"
                        onPress={() => openClusterModal(incident)}
                      >
                        <Layers size={12} color="#1E40AF" strokeWidth={2} />
                        <Text className="text-blue-800 text-xs font-medium ml-1">Part of cluster</Text>
                      </TouchableOpacity>
                    ) : null}
                    <Text className="text-gray-600 mb-2">{incident.description}</Text>
                  </View>
                </View>

                <View className="gap-y-2">
                  <View className="flex-row items-center">
                    <MapPin size={14} color="#6B7280" strokeWidth={1.5} />
                    <Text className="ml-2 text-sm text-gray-600">{incident.location}</Text>
                  </View>
                  <View className="flex-row items-center">
                    <User size={14} color="#6B7280" strokeWidth={1.5} />
                    <Text className="ml-2 text-sm text-gray-600">Report #{incident.id.slice(-6)}</Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center">
                      <Clock size={14} color="#6B7280" strokeWidth={1.5} />
                      <Text className="ml-2 text-sm text-gray-600">{getTimeAgo(incident.reportedAt)}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert(
                          'Update Status',
                          'Change incident status:',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Dispatch', onPress: () => updateReportStatus(incident.id, 'dispatched') },
                            { text: 'Responding', onPress: () => updateReportStatus(incident.id, 'responding') },
                            { text: 'Resolve', onPress: () => updateReportStatus(incident.id, 'resolved') },
                          ]
                        );
                      }}
                      className="bg-purple-100 px-3 py-1 rounded-full"
                    >
                      <Text className="text-sm text-purple-600 font-medium">
                        {incident.status}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {incident.assigned_team_id && (
                    <View className="flex-row items-center mt-3 pt-3 border-t border-gray-200">
                      <Users size={14} color="#3B82F6" strokeWidth={1.5} />
                      <Text className="ml-2 text-sm text-blue-600 font-medium">
                        Assigned Team:
                      </Text>
                      <Text className="ml-2 text-sm text-red-600 font-bold">
                       {incident.assigned_team?.name || 'Assigned'}
                      </Text>
                    </View>
                  )}

                  {!incident.assigned_team_id && incident.status === 'pending' && (
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedIncident(incident);
                        setShowTeamModal(true);
                      }}
                      className="mt-3 bg-blue-600 py-2 rounded-lg flex-row items-center justify-center"
                    >
                      <Users size={16} color="#FFFFFF" strokeWidth={2} />
                      <Text className="text-white font-semibold ml-2">Assign Team</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            ))}
            {filteredIncidents.length === 0 && (
              <View className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 items-center">
                <AlertTriangle size={48} color="#D1D5DB" strokeWidth={1.5} />
                <Text className="text-gray-500 font-medium mt-4 mb-2">No {selectedFilter.toLowerCase()} incidents</Text>
                <Text className="text-gray-400 text-center text-sm">
                  {selectedFilter === 'All' ? 'No incidents reported yet' : `No ${selectedFilter.toLowerCase()} incidents at this time`}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={showClusterModal}
        animationType="slide"
        transparent={true}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 max-h-[80%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-bold text-gray-900">Cluster Update</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowClusterModal(false);
                  setClusterInfo(null);
                  setUpdateMessage('');
                }}
                className="p-2"
              >
                <X size={24} color="#6B7280" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {loading && !clusterInfo ? (
              <View className="py-8 items-center">
                <ActivityIndicator size="large" color="#9333EA" />
                <Text className="text-gray-600 mt-4">Loading cluster information...</Text>
              </View>
            ) : clusterInfo ? (
              <ScrollView className="mb-4" showsVerticalScrollIndicator={false}>
                <View className="bg-blue-50 rounded-xl p-4 mb-4 border border-blue-100">
                  <Text className="font-semibold text-blue-900 mb-2">Cluster Information</Text>
                  <Text className="text-sm text-blue-800 mb-1">
                    Total Reports: {clusterInfo.totalReports}
                  </Text>
                  <Text className="text-sm text-blue-800 mb-1">
                    Citizens Subscribed: {clusterInfo.subscribers}
                  </Text>
                  <Text className="text-sm text-blue-800">
                    Previous Updates: {clusterInfo.updates.length}
                  </Text>
                </View>

                <Text className="font-semibold text-gray-900 mb-2">Send Update to All Citizens</Text>

                <Text className="text-sm text-gray-700 mb-2">Status</Text>
                <View className="flex-row mb-4">
                  {['pending', 'dispatched', 'responding', 'resolved'].map((status) => (
                    <TouchableOpacity
                      key={status}
                      onPress={() => setUpdateStatus(status)}
                      className={`px-3 py-2 rounded-full mr-2 ${
                        updateStatus === status ? 'bg-purple-600' : 'bg-gray-200'
                      }`}
                    >
                      <Text className={`text-xs font-medium capitalize ${
                        updateStatus === status ? 'text-white' : 'text-gray-700'
                      }`}>
                        {status}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text className="text-sm text-gray-700 mb-2">Message</Text>
                <TextInput
                  value={updateMessage}
                  onChangeText={setUpdateMessage}
                  placeholder="Enter update message for all citizens..."
                  multiline
                  numberOfLines={4}
                  className="bg-gray-50 rounded-xl p-4 text-gray-900 mb-4 border border-gray-200"
                  style={{ textAlignVertical: 'top' }}
                />

                <TouchableOpacity
                  onPress={sendClusterUpdate}
                  disabled={loading || !updateMessage.trim()}
                  className={`rounded-xl py-4 flex-row items-center justify-center ${
                    loading || !updateMessage.trim() ? 'bg-gray-300' : 'bg-purple-600'
                  }`}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Send size={20} color="#FFFFFF" strokeWidth={2} />
                      <Text className="text-white font-semibold ml-2">
                        Send to {clusterInfo.subscribers} Citizens
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {clusterInfo.updates.length > 0 && (
                  <View className="mt-4">
                    <Text className="font-semibold text-gray-900 mb-2">Previous Updates</Text>
                    {clusterInfo.updates.slice(0, 3).map((update: any, index: number) => (
                      <View key={index} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-200">
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-xs text-gray-500">
                            {new Date(update.created_at).toLocaleString()}
                          </Text>
                          <View className="bg-gray-200 px-2 py-1 rounded-full">
                            <Text className="text-xs text-gray-700 capitalize">{update.status}</Text>
                          </View>
                        </View>
                        <Text className="text-sm text-gray-700">{update.message}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showTeamModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTeamModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-3xl p-6 max-h-[80%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-bold text-gray-900">Assign Team</Text>
              <TouchableOpacity onPress={() => setShowTeamModal(false)}>
                <X size={24} color="#6B7280" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <Text className="text-sm text-gray-600 mb-4">
              Select a team to respond to this incident
            </Text>

            <ScrollView className="max-h-96">
              {availableTeams && availableTeams.length > 0 ? (
                availableTeams.map((team) => (
                  <TouchableOpacity
                    key={team.id}
                    onPress={() => assignTeamToIncident(team.id)}
                    className="bg-gray-50 p-4 rounded-xl mb-3 border border-gray-200"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <Text className="font-semibold text-gray-900">{team.name}</Text>
                        {team.team_leader && (
                          <Text className="text-sm text-gray-600 mt-1">
                            Leader: {team.team_leader.name}
                          </Text>
                        )}
                        <Text className="text-xs text-gray-500 mt-1">
                          {team.member_count || 0} members
                        </Text>
                      </View>
                      <Users size={20} color="#3B82F6" strokeWidth={2} />
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <Text className="text-center text-gray-500 py-8">
                  No teams available
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default React.memo(AdminIncidents);