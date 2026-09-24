import { Redirect, Tabs } from 'expo-router';
import { Radio, MapPin, Clock, Users, User } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { ActivityIndicator, View } from 'react-native';
// import { IncidentAlertNotification } from '@/components/IncidentAlertNotification';

export default function ResponderTabLayout() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role !== 'responder') return <Redirect href="/" />;

  return (
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#059669',
          tabBarInactiveTintColor: '#6B7280',
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopColor: '#E5E7EB',
            borderTopWidth: 1,
          },
        }}
      >
        <Tabs.Screen
          name="dispatch"
          options={{
            title: 'Dispatch',
            tabBarIcon: ({ size, color }) => (
              <Radio size={size} color={color} strokeWidth={1.5} />
            ),
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: 'Map',
            tabBarIcon: ({ size, color }) => (
              <MapPin size={size} color={color} strokeWidth={1.5} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: ({ size, color }) => (
              <Clock size={size} color={color} strokeWidth={1.5} />
            ),
          }}
        />
        <Tabs.Screen
          name="team"
          options={{
            title: 'Team',
            tabBarIcon: ({ size, color }) => (
              <Users size={size} color={color} strokeWidth={1.5} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ size, color }) => (
              <User size={size} color={color} strokeWidth={1.5} />
            ),
          }}
        />
    </Tabs>
   
  );
}
