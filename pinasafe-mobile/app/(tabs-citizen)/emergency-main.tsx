import { useAuth } from '@/contexts/AuthContext';
import { useEmergency } from '@/contexts/EmergencyContext';
import { locationService } from '@/hooks/locationService';
import { router } from 'expo-router';
import { TriangleAlert as AlertTriangle, Ambulance, Building, Camera, Clock, FileText, Flame, MapPin, Phone, Shield } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Alert, Image, ScrollView, Text, TouchableOpacity, View, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const emergencyServices = [
  {
    id: 1,
    name: 'PNP / PULIS',
    number: '+63-998-598-6494',
    icon: Shield,
    color: 'bg-safety-600',
    description: 'Philippine National Police',
  },
  {
    id: 2,
    name: 'BFP / BUMBERO',
    number: '+63-906-616-5596',
    icon: Flame,
    color: 'bg-red-600',
    description: 'Bureau of Fire Protection',
  },
  {
    id: 4,
    name: 'MDRRMO / RESCUE',
    number: '+63-917-844-9843',
    icon: Building,
    color: 'bg-amber-600',
    description: 'Hilongos DRRMO',
  },
];

const quickActions = [
  { id: 1, name: 'Report Emergency', icon: Camera, color: 'bg-blue-500' },
];

const CitizenEmergency: React.FC = () => {
 // Safe context usage
  let user: any = null;
  let getActiveAlerts: () => any[] = () => [];
  
  try {
    const authContext = useAuth();
    user = authContext.user;
  } catch (error) {
    console.warn('Context not available:', error);
  }

  const dialNumber = (phone: string) => {
    const clean = phone.replace(/[^0-9+]/g, '');
    const url = Platform.OS === 'ios' ? `telprompt:${clean}` : `tel:${clean}`;
    Linking.openURL(url);
  };


  const handleQuickAction = useCallback((action: string) => {
    if (action === 'Report Emergency') {
      router.push('/(tabs-citizen)/emergency/report');
    }  
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-gray-50 h-screen"
      edges={['top', 'left', 'right']}
    >
      <ScrollView className="flex-1"
      showsVerticalScrollIndicator={true}
      >
        {/* Header */}
        <View className="bg-white px-6 py-6 shadow-sm flex-row items-center">
          {/* Avatar */}
          <Image
            source={{ uri: 'https://i.pravatar.cc/100' }}
            className="w-14 h-14 rounded-full mr-4"
          />

          {/* User Info */}
          <View>
            <Text className="text-2xl font-bold text-gray-900">
              {user?.name ? `Welcome back, ${user.name}` : "Welcome"}
            </Text>
            <Text className="text-gray-600 mt-1">Hilongos, Leyte</Text>
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
                onPress={() => dialNumber(service.number)}   // OPEN DIALER WHEN TAPPING ANYWHERE
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

                {/* RED PHONE ICON → ALSO OPENS THE DIALER */}
                <TouchableOpacity onPress={() => dialNumber(service.number)}>
                  <Phone size={20} color="#DC2626" strokeWidth={1.5} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
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