import { Redirect, Tabs } from 'expo-router';
import { Radio, MapPin, Clock, Users, User } from 'lucide-react-native';
import { useTabBarPresentation } from '@/components/ui/useTabBarPresentation';
import { LoadingState, Screen } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';


export default function ResponderTabLayout() {
  const { user, isLoading } = useAuth();
  const tabPresentation = useTabBarPresentation();
  if (isLoading) return <Screen><LoadingState label="Opening your workspace…" rows={2} /></Screen>;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role !== 'responder') return <Redirect href="/" />;

  return (
      <Tabs
        screenOptions={{
          headerShown: false,
          ...tabPresentation,
        }}
      >
        <Tabs.Screen
          name="dispatch"
          options={{
            title: 'Assignments',
            tabBarLabel: 'Dispatch',
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
