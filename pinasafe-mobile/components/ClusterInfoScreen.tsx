import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, MapPin, Clock, AlertCircle, ChevronRight } from 'lucide-react-native';
import { apiService } from '../services/apiService';

interface ClusterInfoScreenProps {
  onClose?: () => void;
}

export default function ClusterInfoScreen({ onClose }: ClusterInfoScreenProps) {
  const [clusters, setClusters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadClusters = async () => {
    try {
      const response = await apiService.getMyClusters();
      if (response.data) {
        setClusters(response.data);
      }
    } catch (error) {
      console.error('Error loading clusters:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadClusters();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadClusters();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'border-l-red-600 bg-red-50';
      case 'high':
        return 'border-l-orange-500 bg-orange-50';
      case 'medium':
        return 'border-l-amber-500 bg-amber-50';
      case 'low':
        return 'border-l-blue-500 bg-blue-50';
      default:
        return 'border-l-gray-500 bg-gray-50';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved':
        return 'bg-green-100 text-green-700';
      case 'responding':
        return 'bg-blue-100 text-blue-700';
      case 'dispatched':
        return 'bg-amber-100 text-amber-700';
      case 'pending':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#DC2626" />
          <Text className="mt-4 text-gray-600">Loading cluster information...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="bg-white px-6 py-6 shadow-sm">
          <Text className="text-2xl font-bold text-gray-900">My Incident Clusters</Text>
          <Text className="text-gray-600 mt-1">
            Track related incidents and live updates
          </Text>
        </View>

        {clusters.length === 0 ? (
          <View className="mx-6 mt-8 items-center">
            <AlertCircle size={48} color="#9CA3AF" strokeWidth={1.5} />
            <Text className="text-gray-600 text-center mt-4">
              You have no active incident clusters
            </Text>
            <Text className="text-gray-500 text-center mt-2 text-sm">
              When you report an incident, it may be grouped with similar reports
            </Text>
          </View>
        ) : (
          <View className="mx-6 mt-4 gap-y-4">
            {clusters.map((cluster) => {
              const primaryIncident = cluster.incidents[0];
              const latestUpdate = cluster.updates[0];

              return (
                <TouchableOpacity
                  key={cluster.cluster_id}
                  className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${getPriorityColor(
                    primaryIncident?.priority
                  )}`}
                >
                  <View className="flex-row items-start justify-between mb-3">
                    <View className="flex-1">
                      <Text className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        {primaryIncident?.type} Emergency
                      </Text>
                      <Text className="font-bold text-gray-900 text-lg">
                        {primaryIncident?.title}
                      </Text>
                    </View>
                    <View className={`px-3 py-1 rounded-full ${getStatusColor(primaryIncident?.status)}`}>
                      <Text className="text-xs font-semibold uppercase">
                        {primaryIncident?.status}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center mb-2">
                    <MapPin size={14} color="#6B7280" strokeWidth={1.5} />
                    <Text className="text-sm text-gray-600 ml-2">
                      {primaryIncident?.location}
                    </Text>
                  </View>

                  <View className="flex-row items-center mb-3">
                    <Users size={14} color="#6B7280" strokeWidth={1.5} />
                    <Text className="text-sm text-gray-600 ml-2">
                      {cluster.totalReports} related {cluster.totalReports === 1 ? 'report' : 'reports'} · {cluster.subscribers} {cluster.subscribers === 1 ? 'citizen' : 'citizens'} notified
                    </Text>
                  </View>

                  {latestUpdate && (
                    <View className="bg-blue-50 rounded-lg p-3 mb-3 border border-blue-100">
                      <View className="flex-row items-center mb-1">
                        <Clock size={12} color="#2563EB" strokeWidth={1.5} />
                        <Text className="text-xs text-blue-600 ml-1 font-medium">
                          Latest Update - {new Date(latestUpdate.created_at).toLocaleTimeString()}
                        </Text>
                      </View>
                      <Text className="text-sm text-gray-700">{latestUpdate.message}</Text>
                    </View>
                  )}

                  <View className="flex-row items-center pt-2 border-t border-gray-100">
                    <Clock size={12} color="#9CA3AF" strokeWidth={1.5} />
                    <Text className="text-xs text-gray-500 ml-1 flex-1">
                      Reported {new Date(primaryIncident?.created_at).toLocaleString()}
                    </Text>
                    <View className="flex-row items-center">
                      <Text className="text-xs text-blue-600 font-medium">
                        {cluster.updates.length} {cluster.updates.length === 1 ? 'update' : 'updates'}
                      </Text>
                      <ChevronRight size={14} color="#2563EB" strokeWidth={2} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View className="mx-6 mt-6 mb-6 bg-blue-50 rounded-xl p-4 border border-blue-100">
          <Text className="font-semibold text-blue-900 mb-2">About Incident Clustering</Text>
          <Text className="text-sm text-blue-800 leading-5">
            When multiple citizens report similar incidents within 500 meters of each other on the same day,
            they are automatically grouped together. All citizens in a cluster receive live updates from responders.
          </Text>
        </View>
      </ScrollView>

      {onClose && (
        <View className="px-6 py-4 bg-white border-t border-gray-200">
          <TouchableOpacity
            className="bg-gray-200 rounded-xl py-3"
            onPress={onClose}
          >
            <Text className="text-center font-semibold text-gray-700">Close</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
