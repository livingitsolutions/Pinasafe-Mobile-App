import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, MapPin, CheckCircle, AlertTriangle, Calendar } from 'lucide-react-native';
import { useEmergency } from '@/contexts/EmergencyContext';
import { useAuth } from '@/contexts/AuthContext';

function ResponderHistory() {
  const { reports } = useEmergency();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);  
    // Simulate a refresh action
    setTimeout(() => {
      setRefreshing(false);
    }
    , 1000);
  }, []);

  const resolvedIncidents = useMemo(() => {
    return reports
      .filter(report =>
        report.status === 'resolved' &&
        (report.responderId === user?.id || report.responder_id === user?.id)
      )
      .sort((a, b) => {
        const dateA = new Date(b.resolved_at || b.updated_at || b.created_at);
        const dateB = new Date(a.resolved_at || a.updated_at || a.created_at);
        return dateA.getTime() - dateB.getTime();
      });
  }, [reports, user]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = resolvedIncidents.filter(incident => {
      const date = new Date(incident.resolved_at || incident.updated_at);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });

    const totalResponseTime = resolvedIncidents.reduce((acc, incident) => {
      if (incident.resolved_at && incident.created_at) {
        const created = new Date(incident.created_at).getTime();
        const resolved = new Date(incident.resolved_at).getTime();
        return acc + (resolved - created);
      }
      return acc;
    }, 0);

    const avgResponseMinutes = resolvedIncidents.length > 0
      ? Math.round(totalResponseTime / resolvedIncidents.length / 60000)
      : 0;

    return {
      thisMonth: thisMonth.length,
      avgResponse: avgResponseMinutes,
    };
  }, [resolvedIncidents]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateDuration = (incident: any) => {
    if (incident.resolved_at && incident.created_at) {
      const created = new Date(incident.created_at).getTime();
      const resolved = new Date(incident.resolved_at).getTime();
      const durationMinutes = Math.round((resolved - created) / 60000);

      if (durationMinutes < 60) {
        return `${durationMinutes} min`;
      }
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      return `${hours}h ${minutes}min`;
    }
    return 'N/A';
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
        <View className="bg-white px-6 py-6 shadow-sm">
          <Text className="text-2xl font-bold text-gray-900">Response History</Text>
          <Text className="text-gray-600 mt-1">Your completed incidents</Text>
        </View>

        {/* Stats Cards */}
        <View className="px-6 mt-4">
          <View className="flex-row justify-between">
            <View className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100 mr-2">
              <Text className="text-2xl font-bold text-green-600">{stats.thisMonth}</Text>
              <Text className="text-gray-600 text-sm">This Month</Text>
            </View>
            <View className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100 ml-2">
              <Text className="text-2xl font-bold text-blue-600">{stats.avgResponse}m</Text>
              <Text className="text-gray-600 text-sm">Avg Response</Text>
            </View>
          </View>
        </View>

        {/* History List */}
        <View className="px-6 mt-6">
          {resolvedIncidents.length === 0 ? (
            <View className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 items-center">
              <CheckCircle size={48} color="#D1D5DB" strokeWidth={1.5} />
              <Text className="text-gray-500 font-medium mt-4 mb-2">No History Yet</Text>
              <Text className="text-gray-400 text-center text-sm">
                Your completed incidents will appear here
              </Text>
            </View>
          ) : (
            <View className="gap-y-4">
              {resolvedIncidents.map((incident) => (
                <TouchableOpacity
                  key={incident.id}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
                >
                  <View className="flex-row items-start justify-between mb-3">
                    <View className="flex-1">
                      <View className="flex-row items-center mb-2">
                        <CheckCircle size={16} color="#059669" strokeWidth={1.5} />
                        <Text className="ml-2 font-bold text-gray-900">
                          {incident.type ? `${incident.type.charAt(0).toUpperCase() + incident.type.slice(1)} Emergency` : 'Emergency'}
                        </Text>
                      </View>
                      <Text className="text-gray-600 mb-2">
                        {incident.notes || incident.description || 'Incident resolved successfully'}
                      </Text>
                    </View>
                  </View>

                  <View className="gap-y-2">
                    <View className="flex-row items-center">
                      <MapPin size={14} color="#6B7280" strokeWidth={1.5} />
                      <Text className="ml-2 text-sm text-gray-600">{incident.location || 'Location not available'}</Text>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center">
                        <Calendar size={14} color="#6B7280" strokeWidth={1.5} />
                        <Text className="ml-2 text-sm text-gray-600">
                          {formatDate(incident.resolved_at || incident.updated_at)} at {formatTime(incident.resolved_at || incident.updated_at)}
                        </Text>
                      </View>
                      <View className="flex-row items-center">
                        <Clock size={14} color="#6B7280" strokeWidth={1.5} />
                        <Text className="ml-2 text-sm text-gray-600">{calculateDuration(incident)}</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View className="h-6" />
      </ScrollView>
    </SafeAreaView>
  );
}

export default React.memo(ResponderHistory);
