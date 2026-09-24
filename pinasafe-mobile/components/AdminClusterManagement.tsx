import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Layers, Users, MapPin, Clock, AlertCircle, TrendingUp } from 'lucide-react-native';
import { apiService } from '../services/apiService';

export default function AdminClusterManagement() {
  const [statistics, setStatistics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStatistics = async () => {
    try {
      const response = await apiService.getClusterStatistics();
      if (response.data) {
        setStatistics(response.data);
      }
    } catch (error) {
      console.error('Error loading cluster statistics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStatistics();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadStatistics();
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#9333EA" />
          <Text className="mt-4 text-gray-600">Loading cluster statistics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const efficiency = statistics?.uniqueClusters > 0
    ? ((statistics.clusteredIncidents / statistics.totalIncidentsToday) * 100).toFixed(0)
    : 0;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="bg-white px-6 py-6 shadow-sm">
          <Text className="text-2xl font-bold text-gray-900">Cluster Management</Text>
          <Text className="text-gray-600 mt-1">
            Monitor incident clustering and efficiency
          </Text>
        </View>

        {statistics ? (
          <>
            <View className="mx-6 mt-6">
              <Text className="text-lg font-bold text-gray-900 mb-3">Today's Overview</Text>
              <View className="flex-row flex-wrap justify-between">
                <View className="w-[48%] bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="bg-purple-500 p-2 rounded-lg">
                      <Layers size={20} color="#FFFFFF" strokeWidth={1.5} />
                    </View>
                  </View>
                  <Text className="text-2xl font-bold text-gray-900">
                    {statistics.uniqueClusters}
                  </Text>
                  <Text className="text-gray-600 text-sm">Active Clusters</Text>
                </View>

                <View className="w-[48%] bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="bg-blue-500 p-2 rounded-lg">
                      <AlertCircle size={20} color="#FFFFFF" strokeWidth={1.5} />
                    </View>
                  </View>
                  <Text className="text-2xl font-bold text-gray-900">
                    {statistics.totalIncidentsToday}
                  </Text>
                  <Text className="text-gray-600 text-sm">Total Incidents</Text>
                </View>

                <View className="w-[48%] bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="bg-green-500 p-2 rounded-lg">
                      <Users size={20} color="#FFFFFF" strokeWidth={1.5} />
                    </View>
                  </View>
                  <Text className="text-2xl font-bold text-gray-900">
                    {statistics.clusteredIncidents}
                  </Text>
                  <Text className="text-gray-600 text-sm">Clustered Reports</Text>
                </View>

                <View className="w-[48%] bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="bg-amber-500 p-2 rounded-lg">
                      <TrendingUp size={20} color="#FFFFFF" strokeWidth={1.5} />
                    </View>
                  </View>
                  <Text className="text-2xl font-bold text-gray-900">
                    {statistics.averageIncidentsPerCluster}
                  </Text>
                  <Text className="text-gray-600 text-sm">Avg per Cluster</Text>
                </View>
              </View>
            </View>

            <View className="mx-6 mt-6">
              <View className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl p-6 shadow-sm">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-purple-100 text-sm mb-1">Clustering Efficiency</Text>
                    <Text className="text-white text-3xl font-bold">{efficiency}%</Text>
                    <Text className="text-purple-100 text-sm mt-2">
                      {statistics.clusteredIncidents} of {statistics.totalIncidentsToday} incidents grouped
                    </Text>
                  </View>
                  <View className="bg-white/20 rounded-full p-4">
                    <Layers size={32} color="#FFFFFF" strokeWidth={2} />
                  </View>
                </View>
              </View>
            </View>

            <View className="mx-6 mt-6">
              <Text className="text-lg font-bold text-gray-900 mb-3">How Clustering Works</Text>
              <View className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <View className="flex-row items-start mb-4">
                  <View className="bg-blue-100 rounded-full p-2 mr-3">
                    <MapPin size={16} color="#2563EB" strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-gray-900 mb-1">Location-Based</Text>
                    <Text className="text-sm text-gray-600">
                      Incidents within 500 meters are automatically grouped together
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-start mb-4">
                  <View className="bg-purple-100 rounded-full p-2 mr-3">
                    <AlertCircle size={16} color="#9333EA" strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-gray-900 mb-1">Same Classification</Text>
                    <Text className="text-sm text-gray-600">
                      Only incidents of the same type (fire, medical, etc.) are clustered
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-start">
                  <View className="bg-green-100 rounded-full p-2 mr-3">
                    <Clock size={16} color="#059669" strokeWidth={2} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-gray-900 mb-1">Same Day</Text>
                    <Text className="text-sm text-gray-600">
                      Clustering only applies to incidents reported on the same day
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View className="mx-6 mt-6 mb-6">
              <Text className="text-lg font-bold text-gray-900 mb-3">Benefits</Text>
              <View className="gap-y-3">
                <View className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <Text className="font-semibold text-gray-900 mb-1">Efficient Response</Text>
                  <Text className="text-sm text-gray-600">
                    Responders can handle multiple related reports as one coordinated response
                  </Text>
                </View>

                <View className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <Text className="font-semibold text-gray-900 mb-1">Real-time Updates</Text>
                  <Text className="text-sm text-gray-600">
                    All citizens in a cluster receive the same live updates simultaneously
                  </Text>
                </View>

                <View className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <Text className="font-semibold text-gray-900 mb-1">Better Coordination</Text>
                  <Text className="text-sm text-gray-600">
                    Prevents duplicate responses and ensures comprehensive coverage
                  </Text>
                </View>
              </View>
            </View>
          </>
        ) : (
          <View className="mx-6 mt-8 items-center">
            <AlertCircle size={48} color="#9CA3AF" strokeWidth={1.5} />
            <Text className="text-gray-600 text-center mt-4">
              No cluster statistics available
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
