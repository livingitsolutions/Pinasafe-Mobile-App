import { AuthProvider } from '@/contexts/AuthContext';
import { EmergencyProvider } from '@/contexts/EmergencyContext';
import "@/globals.css";
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import ConnectivityBanner from '@/components/ConnectivityBanner';
import { InstallPromptProvider } from '@/contexts/InstallPromptContext';
import { registerServiceWorker } from '@/utils/pwaRegistration';

export default function RootLayout() {
  useFrameworkReady();
  const [fontsLoaded] = useFonts({
    'Quicksand-Medium': require('@/assets/fonts/Quicksand-Medium.ttf'),
    'Quicksand-SemiBold': require('@/assets/fonts/Quicksand-SemiBold.ttf'),
    'Quicksand-Bold': require('@/assets/fonts/Quicksand-Bold.ttf'),
  });

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') void registerServiceWorker(window, !__DEV__);
  }, []);

  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <EmergencyProvider>
        <InstallPromptProvider>
        <View style={{ flex: 1 }}>
        <ConnectivityBanner />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs-citizen)" />
          <Stack.Screen name="(tabs-responder)" />
          <Stack.Screen name="(tabs-admin)" />
          <Stack.Screen name="index" />
          <Stack.Screen name="accept-personnel-invitation" />
          <Stack.Screen name="incident/[id]" />
          <Stack.Screen name="+not-found" />
        </Stack>
        </View>
        <StatusBar style="auto" />
        </InstallPromptProvider>
      </EmergencyProvider>
    </AuthProvider>
  );
}
