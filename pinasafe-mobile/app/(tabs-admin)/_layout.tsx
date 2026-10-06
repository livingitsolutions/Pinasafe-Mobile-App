import { Redirect, Tabs } from 'expo-router';
import { BarChart3, Users, AlertTriangle, UsersRound, User } from 'lucide-react-native';
import { useTabBarPresentation } from '@/components/ui/useTabBarPresentation';
import { LoadingState, Screen } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useWindowDimensions } from 'react-native';

const AdminTabLayout: React.FC = () => {
  const { user, isLoading } = useAuth();
  const tabPresentation = useTabBarPresentation();
  const { width } = useWindowDimensions();
  const desktop = width >= 1040;
  if (isLoading) return <Screen><LoadingState label="Opening your workspace…" rows={2} /></Screen>;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role !== 'admin') return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        ...tabPresentation,
        tabBarPosition: desktop ? 'left' : 'bottom',
        tabBarLabelPosition: desktop ? 'beside-icon' : 'below-icon',
        tabBarStyle: {
          ...tabPresentation.tabBarStyle,
          ...(desktop ? { width: 220, height: undefined, paddingTop: 24 } : {}),
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Command',
          tabBarIcon: ({ size, color }) => (
            <BarChart3 size={size} color={color} strokeWidth={1.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="incidents"
        options={{
          title: 'Incidents',
          tabBarIcon: ({ size, color }) => (
            <AlertTriangle size={size} color={color} strokeWidth={1.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: 'Personnel',
          tabBarIcon: ({ size, color }) => (
            <Users size={size} color={color} strokeWidth={1.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="teams"
        options={{
          title: 'Teams',
          tabBarIcon: ({ size, color }) => (
            <UsersRound size={size} color={color} strokeWidth={1.5} />
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

export default AdminTabLayout;
