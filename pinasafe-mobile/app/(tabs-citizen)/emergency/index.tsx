import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Phone, MapPin, TriangleAlert as AlertTriangle, Shield, Ambulance, Flame, Car, Building, Clock, FileText } from 'lucide-react-native';

const emergencyServices = [
  {
    id: 1,
    name: 'Police',
    number: '117',
    icon: Shield,
    color: 'bg-safety-600',
    description: 'Philippine National Police',
  },
  {
    id: 2,
    name: 'Fire Department',
    number: '116',
    icon: Flame,
    color: 'bg-red-600',
    description: 'Bureau of Fire Protection',
  },
  {
    id: 3,
    name: 'Medical Emergency',
    number: '911',
    icon: Ambulance,
    color: 'bg-green-600',
    description: 'Emergency Medical Services',
  },
  {
    id: 4,
    name: 'Disaster Risk Office',
    number: '(053) 555-0123',
    icon: Building,
    color: 'bg-amber-600',
    description: 'Hilongos DRRMO',
  },
];

const quickActions = [
  { id: 1, name: 'Share Location', icon: MapPin, color: 'bg-blue-500' },
  { id: 2, name: 'Send Alert', icon: AlertTriangle, color: 'bg-orange-500' },
  { id: 3, name: 'Emergency Call', icon: Phone, color: 'bg-red-500' },
];

function CitizenEmergency() {
  const handleEmergencyCall = useCallback((service: typeof emergencyServices[0]) => {
    Alert.alert(
      `Call ${service.name}?`,
      `This will dial ${service.number} - ${service.description}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call Now', style: 'default' },
      ]
    );
  }, []);

  const handleQuickAction = useCallback((action: string) => {
    if (action === 'Send Alert') {
      router.push('/emergency/report');
    } else {
      Alert.alert('Feature Coming Soon', `${action} will be available in the next update.`);
    }
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1">
        {/* Emergency Alert Banner */}
        <View className="mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex-row items-center">
          <AlertTriangle size={24} color="#D97706" strokeWidth={1.5} />
          <View className="ml-3 flex-1">
            <Text className="font-semibold text-amber-800">Weather Alert</Text>
            <Text className="text-amber-700 text-sm">Moderate rain expected today. Stay safe!</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View className="mx-6 mt-6">
          <Text className="text-lg font-bold text-gray-900 mb-3">Quick Actions</Text>
          <View className="flex-row justify-between">
            {quickActions.map((action) => (
              <TouchableOpacity
                key={action.id}
                onPress={() => handleQuickAction(action.name)}
                className="flex-1 mx-1"
              >
                <View className={`${action.color} p-4 rounded-xl items-center`}>
                  <action.icon size={24} color="#FFFFFF" strokeWidth={1.5} />
                  <Text className="text-white text-sm font-medium mt-2 text-center">
                    {action.name}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Emergency Services */}
        <View className="mx-6 mt-6">
          <Text className="text-lg font-bold text-gray-900 mb-3">Emergency Services</Text>
          <View className="gap-y-3">
            {emergencyServices.map((service) => (
              <TouchableOpacity
                key={service.id}
                onPress={() => handleEmergencyCall(service)}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex-row items-center"
              >
                <View className={`${service.color} p-3 rounded-full`}>
                  <service.icon size={24} color="#FFFFFF" strokeWidth={1.5} />
                </View>
                <View className="ml-4 flex-1">
                  <Text className="font-semibold text-gray-900">{service.name}</Text>
                  <Text className="text-gray-600 text-sm">{service.description}</Text>
                  <Text className="text-emergency-600 font-bold mt-1">{service.number}</Text>
                </View>
                <Phone size={20} color="#DC2626" strokeWidth={1.5} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Navigation Options */}
        <View className="mx-6 mt-6">
          <Text className="text-lg font-bold text-gray-900 mb-3">More Options</Text>
          <View className="flex-row justify-between">
            <TouchableOpacity
              onPress={() => router.push('/emergency/report')}
              className="flex-1 bg-white p-4 rounded-xl mr-2 shadow-sm border border-gray-100"
            >
              <FileText size={24} color="#DC2626" strokeWidth={1.5} />
              <Text className="text-gray-900 font-semibold mt-2">Report Emergency</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/emergency/call-history')}
              className="flex-1 bg-white p-4 rounded-xl ml-2 shadow-sm border border-gray-100"
            >
              <Clock size={24} color="#DC2626" strokeWidth={1.5} />
              <Text className="text-gray-900 font-semibold mt-2">Call History</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Emergency Tips */}
        <View className="mx-6 mt-6 mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-3">Emergency Tips</Text>
          <View className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <Text className="font-medium text-gray-900 mb-2">In case of emergency:</Text>
            <Text className="text-gray-600 text-sm leading-5">
              • Stay calm and assess the situation{'\n'}
              • Call appropriate emergency services{'\n'}
              • Provide clear location information{'\n'}
              • Follow instructions from authorities{'\n'}
              • Keep emergency contacts updated
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default React.memo(CitizenEmergency);