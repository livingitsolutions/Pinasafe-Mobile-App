import logo from '@/assets/images/onboarding1.2.png';
import { useAuth } from '@/contexts/AuthContext';
import { Link, router } from 'expo-router';
import { Eye, EyeOff, Lock, Mail, Shield } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();
 
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (!email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    setIsLoading(true);
    try {
      const user = await signIn(email.trim(), password);

      console.log(`✅ User signed in: ${user.name} (${user.role})`);

      if (user.mustChangePassword) {
        router.replace('/change-password');
        return;
      }

      router.replace('/');
    } catch (err: any) {
      console.error('Login error:', err);

      let errorMessage = 'Invalid email or password';

      if (err?.message?.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else if (err?.message?.includes('Email not confirmed')) {
        errorMessage = 'Please check your email and confirm your account before signing in.';
      } else if (err?.message?.includes('Too many requests')) {
        errorMessage = 'Too many login attempts. Please wait a moment and try again.';
      }

      Alert.alert('Login Failed', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // const handleQuickLogin = (role: string) => {
  //   const credentials = {
  //     citizen1: { email: 'citizen1@pinasafe.com', password: 'Lalomanka1' },
  //     citizen2: { email: 'citizen2@pinasafe.com', password: 'Lalomanka1' },
  //     admin: { email: 'bfpadmin@pinasafe.com', password: 'password123' },
  //     admin1: { email: 'drrmoadmin@pinasafe.com', password: 'password123' },
  //     responder1: { email: 'responder1@pinasafe.com', password: 'password123' },
  //     responder2: { email: 'responder2@pinasafe.com', password: 'password123' },
  //   };

  //   const cred = credentials[role as keyof typeof credentials];
  //   setEmail(cred.email);
  //   setPassword(cred.password);
  // };

  return (
    <SafeAreaView className="flex-1 bg-blue-100">
      <ScrollView className="flex-1 px-8">
        {/* Header */}
        <View className="items-center mt-12 mb-8">
          <View className="bg-blue-300 p-6 rounded-full mb-4">
            <Image source={logo} className="w-24 h-24" resizeMode="contain" />
            {/* <Shield size={60} color="#DC2626" strokeWidth={1.5} /> */}
          </View>
          <Text className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</Text>
          <Text className="text-gray-600 text-center">
            Sign in to access PinaSafe
          </Text>
        </View>

        {/* Quick Login Demo Buttons */}
        {/* <View className="mb-6">
          <Text className="text-sm font-medium text-gray-700 mb-3">Quick Demo Login:</Text>
          <View className="flex-row justify-between gap-x-2">
            <TouchableOpacity
              onPress={() => handleQuickLogin('citizen1')}
              className="flex-1 bg-blue-50 border border-blue-200 rounded-lg p-3"
            >
              <Text className="text-blue-700 font-medium text-center text-sm">Citizen1</Text>
            </TouchableOpacity>
             <TouchableOpacity
              onPress={() => handleQuickLogin('citizen2')}
              className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3"
            >
              <Text className="text-green-700 font-medium text-center text-sm">Citizen2</Text>
            </TouchableOpacity>
             <TouchableOpacity
              onPress={() => handleQuickLogin('admin1')}
              className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3"
            >
              <Text className="text-green-700 font-medium text-center text-sm">DRRMO Admin</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleQuickLogin('admin')}
              className="flex-1 bg-purple-50 border border-purple-200 rounded-lg p-3"
            >
              <Text className="text-purple-700 font-medium text-center text-sm">BFP Admin</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleQuickLogin('responder1')}
              className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3"
            >
              <Text className="text-green-700 font-medium text-center text-sm">Responder1</Text>
            </TouchableOpacity>
              <TouchableOpacity
              onPress={() => handleQuickLogin('responder2')}
              className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3"
            >
              <Text className="text-green-700 font-medium text-center text-sm">Responder2</Text>
            </TouchableOpacity>
            
          </View>
        </View> */}

        {/* Login Form */}
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

          <View>
            <Text className="text-gray-700 font-medium mb-2">Password</Text>
            <View className="flex-row items-center bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              <Lock size={20} color="#6B7280" strokeWidth={1.5} />
              <TextInput
                className="flex-1 ml-3 text-gray-900"
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? (
                  <EyeOff size={20} color="#6B7280" strokeWidth={1.5} />
                ) : (
                  <Eye size={20} color="#6B7280" strokeWidth={1.5} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View className="flex-row justify-end">
            <Link href="/(auth)/forgot-password" asChild>
              <TouchableOpacity>
                <Text className="text-emergency-600 font-medium">Forgot Password?</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={isLoading}
            className={`rounded-xl py-4 ${
              isLoading ? 'bg-gray-400' : 'bg-emergency-600'
            }`}
          >
            <Text className="text-white text-center font-semibold text-lg">
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sign Up Link */}
        <View className="flex-row justify-center mt-8">
          <Text className="text-gray-600">Don't have an account? </Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity>
              <Text className="text-emergency-600 font-semibold">Sign Up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default React.memo(LoginScreen);