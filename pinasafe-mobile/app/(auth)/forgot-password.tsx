import { Link, router } from 'expo-router';
import { ArrowLeft, Mail, Shield } from 'lucide-react-native';
import React, { JSX, useCallback, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function ForgotPasswordScreen(): JSX.Element {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleResetPassword = useCallback(async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      setEmailSent(true);
    } catch{
      Alert.alert('Error', 'Unable to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [email]);

  if (emailSent) {
    return (
      <SafeAreaView className="flex-1 bg-white px-6">
        <View className="flex-1 justify-center items-center">
          <View className="bg-green-100 p-6 rounded-full mb-6">
            <Mail size={60} color="#059669" strokeWidth={1.5} />
          </View>
          <Text className="text-2xl font-bold text-gray-900 mb-4 text-center">
            Check Your Email
          </Text>
          <Text className="text-gray-600 text-center mb-8 leading-6">
            We've sent a password reset link to{'\n'}
            <Text className="font-semibold">{email}</Text>
          </Text>
          <TouchableOpacity
            onPress={router.back}
            className="bg-emergency-600 rounded-xl py-4 px-8"
          >
            <Text className="text-white font-semibold text-lg">Back to Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6">
        {/* Header */}
        <View className="flex-row items-center mt-4 mb-8">
          <TouchableOpacity onPress={router.back} className="mr-4">
            <ArrowLeft size={24} color="#374151" strokeWidth={1.5} />
          </TouchableOpacity>
          <Text className="text-xl font-semibold text-gray-900">Reset Password</Text>
        </View>

        <View className="flex-1 justify-center">
          {/* Icon */}
          <View className="items-center mb-8">
            <View className="bg-emergency-100 p-6 rounded-full mb-4">
              <Shield size={60} color="#DC2626" strokeWidth={1.5} />
            </View>
            <Text className="text-2xl font-bold text-gray-900 mb-2">Forgot Password?</Text>
            <Text className="text-gray-600 text-center">
              Enter your email address and we'll send you a link to reset your password.
            </Text>
          </View>

          {/* Form */}
          <View className="gap-y-4">
            <View>
              <Text className="text-gray-700 font-medium mb-2">Email</Text>
              <View className="flex-row items-center bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                <Mail size={20} color="#6B7280" strokeWidth={1.5} />
                <TextInput
                  className="flex-1 ml-3 text-gray-900"
                  placeholder="Enter your email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={handleResetPassword}
              disabled={isLoading}
              className={`rounded-xl py-4 mt-6 ${
                isLoading ? 'bg-gray-400' : 'bg-emergency-600'
              }`}
            >
              <Text className="text-white text-center font-semibold text-lg">
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Back to Login */}
          <View className="flex-row justify-center mt-8">
            <Text className="text-gray-600">Remember your password? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text className="text-emergency-600 font-semibold">Sign In</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default React.memo(ForgotPasswordScreen);