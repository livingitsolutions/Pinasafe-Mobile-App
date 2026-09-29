import { Redirect, Tabs } from 'expo-router';
import { BarChart3, Users, AlertTriangle, UsersRound, User } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { ActivityIndicator, useWindowDimensions, View } from 'react-native';

const AdminTabLayout: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { width } = useWindowDimensions();
  const desktop = width >= 1040;
  if (isLoading) return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role !== 'admin') return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#B91C1C',
        tabBarInactiveTintColor: '#667085',
        tabBarPosition: desktop ? 'left' : 'bottom',
        tabBarLabelPosition: desktop ? 'beside-icon' : 'below-icon',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E4E7EC',
          borderTopWidth: 1,
          ...(desktop ? { width: 220, paddingTop: 24 } : { height: 68, paddingBottom: 8 }),
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
