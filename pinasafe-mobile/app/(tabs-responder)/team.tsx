import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, Phone, MapPin, Activity, MessageCircle, UserCheck } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/apiService';

function ResponderTeam() {
  const { user } = useAuth();
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

  const getStatusColor = useCallback((status: string) => {
    switch (status?.toLowerCase()) {
      case 'on duty':
      case 'available':
        return 'bg-green-500';
      case 'responding':
        return 'bg-amber-500';
      case 'off duty':
      case 'offline':
        return 'bg-gray-400';
      default:
        return 'bg-blue-500';
    }
  }, []);

  const getStatusTextColor = useCallback((status: string) => {
    switch (status?.toLowerCase()) {
      case 'on duty':
      case 'available':
        return 'text-green-600';
      case 'responding':
        return 'text-amber-600';
      case 'off duty':
      case 'offline':
        return 'text-gray-600';
      default:
        return 'text-blue-600';
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTeamData().then(() => setRefreshing(false));
  }, []);

  const getStatusLabel = (member: any) => {
    return 'Available';
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator size="large" color="#059669" />
        <Text className="text-gray-600 mt-4">Loading team data...</Text>
      </SafeAreaView>
    );
  }

  if (!teamData) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <ScrollView
                className="flex-1"
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#9333EA']} />
                }
        >
          <View className="bg-white px-6 py-6 shadow-sm">
            <Text className="text-2xl font-bold text-gray-900">Team</Text>
            <Text className="text-gray-600 mt-1">Emergency response team</Text>
          </View>
          <View className="flex-1 items-center justify-center p-6">
            <Users size={64} color="#D1D5DB" strokeWidth={1.5} />
            <Text className="text-gray-500 font-medium mt-4 mb-2">No Team Assigned</Text>
            <Text className="text-gray-400 text-center text-sm">
              You are not currently assigned to a team
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const teamMembers = teamData.members || [];
  const onDutyCount = teamMembers.length;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1">
        {/* Header */}
        <View className="bg-white px-6 py-6 shadow-sm">
          <Text className="text-2xl font-bold text-gray-900">{teamData.name}</Text>
          <Text className="text-gray-600 mt-1">{teamData.description || 'Emergency response team'}</Text>
        </View>

        {/* Team Stats */}
        <View className="px-6 mt-4">
          <View className="flex-row justify-between">
            <View className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100 mr-2">
              <Text className="text-2xl font-bold text-green-600">{onDutyCount}</Text>
              <Text className="text-gray-600 text-sm">Team Members</Text>
            </View>
            <View className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100 ml-2">
              <Text className="text-2xl font-bold text-blue-600">{teamData.is_active ? 'Active' : 'Inactive'}</Text>
              <Text className="text-gray-600 text-sm">Team Status</Text>
            </View>
          </View>
        </View>

        {/* Team Leader */}
        {teamData.team_leader && (
          <View className="px-6 mt-6">
            <Text className="text-lg font-bold text-gray-900 mb-3">Team Leader</Text>
            <View className="bg-green-50 rounded-xl p-4 shadow-sm border-2 border-green-200">
              <View className="flex-row items-start justify-between mb-3">
                <View className="flex-1">
                  <View className="flex-row items-center mb-1">
                    <View className="w-3 h-3 rounded-full bg-green-500 mr-2" />
                    <Text className="font-bold text-gray-900">{teamData.team_leader.name}</Text>
                    <View className="ml-2 bg-green-500 px-2 py-0.5 rounded-full">
                      <Text className="text-white text-xs font-bold">LEADER</Text>
                    </View>
                  </View>
                  <Text className="text-gray-600 text-sm mb-1">{teamData.team_leader.email}</Text>
                </View>
                <TouchableOpacity className="p-2 bg-green-100 rounded-lg">
                  <Phone size={16} color="#059669" strokeWidth={1.5} />
                </TouchableOpacity>
              </View>
              {teamData.team_leader.phone && (
                <View className="flex-row items-center">
                  <Phone size={14} color="#6B7280" strokeWidth={1.5} />
                  <Text className="ml-2 text-sm text-gray-600">{teamData.team_leader.phone}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Team Members */}
        <View className="px-6 mt-6">
          <Text className="text-lg font-bold text-gray-900 mb-3">Team Members</Text>
          {teamMembers.length === 0 ? (
            <View className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 items-center">
              <Users size={48} color="#D1D5DB" strokeWidth={1.5} />
              <Text className="text-gray-500 font-medium mt-4">No team members</Text>
            </View>
          ) : (
            <View className="gap-y-4">
              {teamMembers.map((member: any) => {
                const isCurrentUser = member.user_id === user?.id;
                const status = getStatusLabel(member);

                return (
                  <View
                    key={member.id}
                    className={`rounded-xl p-4 shadow-sm border ${
                      isCurrentUser ? 'bg-blue-50 border-2 border-blue-200' : 'bg-white border-gray-100'
                    }`}
                  >
                    <View className="flex-row items-start justify-between mb-3">
                      <View className="flex-1">
                        <View className="flex-row items-center mb-1">
                          <View className={`w-3 h-3 rounded-full ${getStatusColor(status)} mr-2`} />
                          <Text className="font-bold text-gray-900">{member.user?.name || 'Unknown'}</Text>
                          {isCurrentUser && (
                            <View className="ml-2 bg-blue-500 px-2 py-0.5 rounded-full">
                              <Text className="text-white text-xs font-bold">YOU</Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-gray-600 text-sm mb-1">
                          {member.position || 'Team Member'}
                        </Text>
                        <Text className={`text-sm font-medium ${getStatusTextColor(status)}`}>
                          {status}
                        </Text>
                      </View>
                      <TouchableOpacity className="p-2 bg-blue-100 rounded-lg">
                        <Phone size={16} color="#2563EB" strokeWidth={1.5} />
                      </TouchableOpacity>
                    </View>

                    <View className="gap-y-2">
                      {member.user?.email && (
                        <View className="flex-row items-center">
                          <MessageCircle size={14} color="#6B7280" strokeWidth={1.5} />
                          <Text className="ml-2 text-sm text-gray-600">{member.user.email}</Text>
                        </View>
                      )}
                      {member.user?.phone && (
                        <View className="flex-row items-center">
                          <Phone size={14} color="#6B7280" strokeWidth={1.5} />
                          <Text className="ml-2 text-sm text-gray-600">{member.user.phone}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View className="h-6" />
      </ScrollView>
    </SafeAreaView>
  );
}

export default React.memo(ResponderTeam);
