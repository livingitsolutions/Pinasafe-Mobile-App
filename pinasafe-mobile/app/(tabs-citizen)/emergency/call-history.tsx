import React, { useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Phone, Clock, MapPin, CheckCircle, AlertTriangle } from 'lucide-react-native';

const callHistory = [
  {
    id: 1,
    service: 'Medical Emergency',
    number: '911',
    date: '2024-01-15',
    time: '14:30',
    duration: '3:45',
    status: 'Completed',
    location: 'Brgy. Poblacion',
    outcome: 'Ambulance dispatched, patient transported to hospital',
  },
  {
    id: 2,
    service: 'Police',
    number: '117',
    date: '2024-01-10',
    time: '22:15',
    duration: '2:20',
    status: 'Completed',
    location: 'Brgy. San Juan',
    outcome: 'Police responded, situation resolved',
  },
  {
    id: 3,
    service: 'Fire Department',
    number: '116',
    date: '2024-01-08',
    time: '16:45',
    duration: '1:30',
    status: 'Completed',
    location: 'Brgy. Liberty',
    outcome: 'False alarm, no fire detected',
  },
];

function CallHistory() {
  const getStatusIcon = useCallback((status: string) => {
    switch (status) {
      case 'Completed':
        return <CheckCircle size={16} color="#059669" strokeWidth={1.5} />;
      case 'In Progress':
        return <AlertTriangle size={16} color="#D97706" strokeWidth={1.5} />;
      default:
        return <Clock size={16} color="#6B7280" strokeWidth={1.5} />;
    }
  }, []);

  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'Completed':
        return 'text-green-600';
      case 'In Progress':
        return 'text-amber-600';
      default:
        return 'text-gray-600';
    }
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1 px-6">
        {/* Header */}
        <View className="mt-4 mb-6">
          <Text className="text-xl font-bold text-gray-900 mb-2">Emergency Call History</Text>
          <Text className="text-gray-600">Your previous emergency service calls</Text>
        </View>

        {/* Stats */}
        <View className="flex-row justify-between mb-6">
          <View className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100 mr-2">
            <Text className="text-2xl font-bold text-emergency-600">3</Text>
            <Text className="text-gray-600 text-sm">Total Calls</Text>
          </View>
          <View className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100 ml-2">
            <Text className="text-2xl font-bold text-green-600">2:32</Text>
            <Text className="text-gray-600 text-sm">Avg Duration</Text>
          </View>
        </View>

        {/* Call History List */}
        <View className="gap-y-4">
          {callHistory.map((call) => (
            <View
              key={call.id}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
            >
              <View className="flex-row items-start justify-between mb-3">
                <View className="flex-1">
                  <View className="flex-row items-center mb-2">
                    <Phone size={16} color="#DC2626" strokeWidth={1.5} />
                    <Text className="ml-2 font-bold text-gray-900">{call.service}</Text>
                    <View className="ml-2 flex-row items-center">
                      {getStatusIcon(call.status)}
                      <Text className={`ml-1 text-sm font-medium ${getStatusColor(call.status)}`}>
                        {call.status}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-emergency-600 font-semibold mb-2">{call.number}</Text>
                </View>
              </View>

              <View className="gap-y-2">
                <View className="flex-row items-center">
                  <MapPin size={14} color="#6B7280" strokeWidth={1.5} />
                  <Text className="ml-2 text-sm text-gray-600">{call.location}</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <Clock size={14} color="#6B7280" strokeWidth={1.5} />
                    <Text className="ml-2 text-sm text-gray-600">
                      {call.date} at {call.time}
                    </Text>
                  </View>
                  <Text className="text-sm text-gray-600">Duration: {call.duration}</Text>
                </View>
              </View>

              <View className="mt-3 pt-3 border-t border-gray-100">
                <Text className="text-sm text-gray-700">{call.outcome}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Empty State for no calls */}
        {callHistory.length === 0 && (
          <View className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 items-center">
            <Phone size={48} color="#D1D5DB" strokeWidth={1.5} />
            <Text className="text-gray-500 font-medium mt-4 mb-2">No Emergency Calls</Text>
            <Text className="text-gray-400 text-center text-sm">
              Your emergency call history will appear here
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default React.memo(CallHistory);