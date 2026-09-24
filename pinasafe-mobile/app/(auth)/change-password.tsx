import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/apiService';

export default function ChangePasswordScreen() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user, signOut, isSigningOut } = useAuth();

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Validation Error', 'Please fill in all fields');
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert('Validation Error', 'Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.post('/auth/change-password', {
        newPassword: newPassword
      });

      if (response.error) {
        Alert.alert('Error', response.error);
        return;
      }

      Alert.alert(
        'Success',
        'Password changed successfully. Please login with your new password.',
        [
          {
            text: 'OK',
            onPress: async () => {
              try {
                await signOut();
                router.replace('/(auth)/login');
              } catch {
                Alert.alert('Sign Out Failed', 'Unable to sign out. Please check your connection and try again.');
              }
            }
          }
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace('/(auth)/login');
    } catch {
      Alert.alert('Sign Out Failed', 'Unable to sign out. Please check your connection and try again.');
    }
  };

  return (
    <View className="flex-1 bg-white px-6 justify-center">
      <View className="mb-8">
        <Text className="text-3xl font-bold text-gray-900 mb-2">Change Password</Text>
        <Text className="text-gray-600">
          You must change your password before continuing
        </Text>
      </View>

      <View className="mb-4">
        <Text className="text-gray-700 mb-2 font-medium">New Password</Text>
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-gray-900"
          placeholder="Enter new password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
        />
      </View>

      <View className="mb-6">
        <Text className="text-gray-700 mb-2 font-medium">Confirm Password</Text>
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-gray-900"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
        />
      </View>

      <TouchableOpacity
        className={`rounded-lg py-4 items-center mb-4 ${
          loading ? 'bg-blue-400' : 'bg-blue-600'
        }`}
        onPress={handleChangePassword}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-semibold text-lg">Change Password</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        className="rounded-lg py-4 items-center border border-gray-300"
        onPress={handleLogout}
        disabled={loading || isSigningOut}
      >
        {isSigningOut ? <ActivityIndicator /> : <Text className="text-gray-700 font-semibold">Logout</Text>}
      </TouchableOpacity>
    </View>
  );
}
