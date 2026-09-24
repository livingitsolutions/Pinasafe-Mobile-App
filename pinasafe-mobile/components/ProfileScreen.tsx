import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { User, MapPin, Phone, Settings, CircleHelp as HelpCircle, Shield, Bell, ChevronRight, Edit3, LogOut, Activity } from 'lucide-react-native';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { organizationAlertService } from '@/services/organizationAlertService';

interface ProfileScreenProps {
  userRole: UserRole;
}

const roleConfig = {
  citizen: {
    title: 'Profile',
    subtitle: 'Manage your emergency information',
    iconBg: 'bg-emergency-100',
    iconColor: '#DC2626',
    roleLabel: 'Citizen',
    roleBg: 'bg-blue-100 text-blue-800',
    menuItems: [
      { id: 1, title: 'Emergency Contacts', icon: Phone, color: 'text-emergency-600' },
      { id: 2, title: 'Location Settings', icon: MapPin, color: 'text-blue-600' },
      { id: 3, title: 'Notifications', icon: Bell, color: 'text-amber-600' },
      { id: 4, title: 'Privacy & Security', icon: Shield, color: 'text-green-600' },
      { id: 5, title: 'Help & Support', icon: HelpCircle, color: 'text-purple-600' },
      { id: 6, title: 'Settings', icon: Settings, color: 'text-gray-600' },
    ],
    stats: null,
    appVersion: 'Version 1.0.0',
  },
  responder: {
    title: 'Responder Profile',
    subtitle: 'Emergency response settings',
    iconBg: 'bg-green-100',
    iconColor: '#059669',
    roleLabel: 'Emergency Responder',
    roleBg: 'bg-green-100 text-green-800',
    menuItems: [
      { id: 1, title: 'Response Settings', icon: Activity, color: 'text-green-600' },
      { id: 2, title: 'Equipment Check', icon: Shield, color: 'text-blue-600' },
      { id: 3, title: 'Training Records', icon: User, color: 'text-purple-600' },
      { id: 4, title: 'Notifications', icon: Bell, color: 'text-amber-600' },
      { id: 5, title: 'Help & Support', icon: HelpCircle, color: 'text-gray-600' },
    ],
     stats: null,
    appVersion: 'Version 1.0.0 - Responder Panel',
  },
  admin: {
    title: 'Admin Profile',
    subtitle: 'System administrator settings',
    iconBg: 'bg-purple-100',
    iconColor: '#7C3AED',
    roleLabel: 'Administrator',
    roleBg: 'bg-purple-100 text-purple-800',
    menuItems: [
      { id: 1, title: 'System Settings', icon: Settings, color: 'text-purple-600' },
      { id: 2, title: 'User Management', icon: User, color: 'text-blue-600' },
      { id: 3, title: 'Security Settings', icon: Shield, color: 'text-green-600' },
      { id: 4, title: 'Notifications', icon: Bell, color: 'text-amber-600' },
      { id: 5, title: 'Help & Support', icon: HelpCircle, color: 'text-gray-600' },
    ],
    stats: null,
    appVersion: 'Version 1.0.0 - Admin Panel',
  },
};

export default function ProfileScreen({ userRole }: ProfileScreenProps) {
  const { user, signOut } = useAuth();
  const config = roleConfig[userRole];
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Simulate a refresh action
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);


  const handleMenuPress = (title: string) => {
    Alert.alert('Feature Coming Soon', `${title} will be available in the next update.`);
  };

  const handleEditProfile = () => {
    Alert.alert('Edit Profile', 'Profile editing feature coming soon.');
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/login');
          }
        },
      ]
    );
  };

  const getRoleIcon = () => {
    switch (userRole) {
      case 'admin':
        return Shield;
      case 'responder':
        return Activity;
      default:
        return User;
    }
  };

  const RoleIcon = getRoleIcon();

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50" edges={['top','left','right']}>
        <View className="flex-1 justify-center items-center">
          <Text className="text-gray-600">Please sign in to view your profile</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top','left','right']}>
      <ScrollView
                      className="flex-1"
                      refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#9333EA']} />
                      }
              >
        {/* Header */}
        <View className="bg-white px-6 py-6 shadow-sm">
               <Text className="text-2xl font-bold text-gray-900">{config.title} </Text>
                {/* <Text className="text-2xl font-bold text-gray-900">{config.title} ( {user?.organizationId ? organizationAlertService.getOrganization(user.organizationId)?.name || 'Unknown' : user?.name} )</Text> */}
          <Text className="text-gray-600 mt-1">{config.subtitle}</Text>
        </View>

        {/* Profile Card */}
        <View className="mx-6 mt-4">
          <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center">
                <View className={`${config.iconBg} p-4 rounded-full`}>
                  <RoleIcon size={32} color={config.iconColor} strokeWidth={1.5} />
                </View>
                <View className="ml-4">
                  <Text className="text-xl font-bold text-gray-900">
                    {user.name}
                  </Text>
                  <View className="flex-row items-center mt-1">
                    <Text className={`text-xs font-medium px-2 py-1 rounded-full ${config.roleBg}`}>
                      {config.roleLabel}
                    </Text>
                    {user.verified && (
                      <View className="ml-2 bg-green-100 px-2 py-1 rounded-full">
                        <Text className="text-green-800 text-xs font-medium">Verified</Text>
                      </View>
                    )}
                    {userRole === 'responder' && (
                      <View className="ml-2 bg-green-100 px-2 py-1 rounded-full">
                        <Text className="text-green-800 text-xs font-medium">On Duty</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              {/* <TouchableOpacity
                onPress={handleEditProfile}
                className="p-2"
              >
                <Edit3 size={20} color="#6B7280" strokeWidth={1.5} />
              </TouchableOpacity> */}
            </View>

            <View className="gap-y-2">
              <View className="flex-row items-center">
                <Text className="text-gray-700 font-bold">Email Addres :</Text>
                <Text className="ml-2 text-gray-700 ">{user.email}</Text>
              </View>
              <View className="flex-row items-center">
                <MapPin size={16} color="#1100fdff" strokeWidth={3} />
                <Text className="ml-3 text-gray-700">
                  {user.address || 
                    (userRole === 'admin' ? 'DRRMO Office, Hilongos, Leyte' :
                     userRole === 'responder' ? 'Emergency Response Station' :
                     'No address provided')}
                </Text>
              </View>
              {user.phone && (
                <View className="flex-row items-center">
                  <Phone size={16} color="#920505ff" strokeWidth={3} />
                  <Text className="ml-3 text-gray-700">{user.phone}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Stats for Responder
        {config.stats && (
          <View className="mx-6 mt-6">
            <Text className="text-lg font-bold text-gray-900 mb-3">Response Statistics</Text>
            <View className="flex-row justify-between">
              {config.stats.map((stat, index) => {
                const colorMap: { [key: string]: string } = {
                  'text-green-600': '#059669',
                  'text-blue-600': '#2563EB',
                };
                const statColor = colorMap[stat.color] || '#6B7280';
                return (
                  <View key={index} className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100 mr-2 last:mr-0">
                    <Text style={{ color: statColor }} className="text-2xl font-bold">{stat.value}</Text>
                    <Text className="text-gray-600 text-sm">{stat.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )} */}

        {/* Menu Items */}
        <View className="mx-6 mt-6 mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-3">
            {userRole === 'admin' ? 'Admin Settings' : 
             userRole === 'responder' ? 'Responder Settings' : 'Settings'}
          </Text>
          <View className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* {config.menuItems.map((item, index) => {
              const IconComponent = item.icon;
              const colorMap: { [key: string]: string } = {
                'text-emergency-600': '#DC2626',
                'text-blue-600': '#2563EB',
                'text-amber-600': '#D97706',
                'text-green-600': '#059669',
                'text-purple-600': '#7C3AED',
                'text-gray-600': '#6B7280',
                'text-gray-900': '#111827',
                'text-red-600': '#DC2626',
              };
              const iconColor = colorMap[item.color] || '#6B7280';

              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => handleMenuPress(item.title)}
                  className={`p-4 flex-row items-center justify-between ${
                    index < config.menuItems.length - 1 ? 'border-b border-gray-100' : ''
                  }`}
                >
                  <View className="flex-row items-center">
                    <IconComponent size={20} color={iconColor} strokeWidth={1.5} />
                    <Text className="ml-3 font-medium text-gray-900">{item.title}</Text>
                  </View>
                  <ChevronRight size={20} color="#9CA3AF" strokeWidth={1.5} />
                </TouchableOpacity>
              );
            })} */}
            
            {/* Sign Out Button */}
            <TouchableOpacity
              onPress={handleSignOut}
              className="p-4 flex-row items-center justify-between border-t border-gray-100"
            >
              <View className="flex-row items-center">
                <LogOut size={20} color="#DC2626" strokeWidth={1.5} />
                <Text className="ml-3 font-medium text-red-600">Sign Out</Text>
              </View>
              <ChevronRight size={20} color="#9CA3AF" strokeWidth={1.5} />
            </TouchableOpacity>
          </View>
        </View>
       
      </ScrollView>
    </SafeAreaView>
  );
}