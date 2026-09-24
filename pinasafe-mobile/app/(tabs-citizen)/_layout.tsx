import { Redirect, Tabs } from 'expo-router';
import { Phone, User, Ambulance } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { ActivityIndicator, View } from 'react-native';

export default function CitizenTabLayout() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role !== 'citizen') return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#DC2626',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E7EB',
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="emergency-main"
        options={{
          title: 'Emergency',
          tabBarIcon: ({ size, color }) => (
            <Phone size={size} color={color} strokeWidth={1.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="reported-emergency"
        options={{
          title: 'Incidents',
          tabBarIcon: ({ size, color }) => (
            <Ambulance size={size} color={color} strokeWidth={1.5} />
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
      <Tabs.Screen
        name="emergency"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
