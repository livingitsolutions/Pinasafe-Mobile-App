import { useAuth } from '@/contexts/AuthContext';
import { resolveRoleRoute } from '@/utils/roleRouting';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import OnboardingScreen from '../components/OnboardingScreen';
import SplashScreen from '../components/SplashScreen';

export default function Index() {
  const [showSplash, setShowSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    const checkFirstLaunch = async () => {
      try {
        const hasLaunched = await AsyncStorage.getItem('hasLaunched');
        if (!hasLaunched) {
          setShowOnboarding(true);
        }
      } catch (error) {
        console.error('Error checking first launch:', error);
      } finally {
        setIsLoading(false);
      }
    };
    checkFirstLaunch();
  }, []);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  const handleOnboardingComplete = useCallback(async () => {
    try {
      await AsyncStorage.setItem('hasLaunched', 'true');
    } catch (error) {
      console.error('Error saving launch status:', error);
    } finally {
      router.replace('/(auth)/login');
    }
  }, []);

  // Wait for auth context to load
  if (authLoading || isLoading) {
    return showSplash ? <SplashScreen onFinish={handleSplashFinish} /> : <View className="flex-1 bg-white" />;
  }

  if (showSplash) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  if (showOnboarding) {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  // Redirect based on authentication status
  if (isAuthenticated) {
    // F2 decision: super_admin has no dedicated UI yet. The admin shell only
    // calls organization-scoped endpoints that fail safely (400/empty state)
    // for an org-less account, so it is safer than exposing citizen
    // functionality (e.g. filing emergency reports) to a platform account.
    return <Redirect href={resolveRoleRoute(user?.role) as any} />;
  } else {
    return <Redirect href="/(auth)/login" />;
  }
}
