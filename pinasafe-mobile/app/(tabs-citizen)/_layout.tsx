import { Redirect, Tabs } from 'expo-router';
import { Phone, User, Ambulance } from 'lucide-react-native';
import { useTabBarPresentation } from '@/components/ui/useTabBarPresentation';
import { LoadingState, Screen } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';


export default function CitizenTabLayout() {
  const { user, isLoading } = useAuth();
  const tabPresentation = useTabBarPresentation();
  if (isLoading) return <Screen><LoadingState label="Opening your workspace…" rows={2} /></Screen>;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role !== 'citizen') return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        ...tabPresentation,
      }}
    >
      <Tabs.Screen
        name="emergency-main"
        options={{
          title: 'Report',
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
