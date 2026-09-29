import { AuthProvider } from '@/contexts/AuthContext';
import { EmergencyProvider } from '@/contexts/EmergencyContext';
import "@/globals.css";
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';

export default function RootLayout() {
  useFrameworkReady();
  const [fontsLoaded] = useFonts({
    'Quicksand-Medium': require('@/assets/fonts/Quicksand-Medium.ttf'),
    'Quicksand-SemiBold': require('@/assets/fonts/Quicksand-SemiBold.ttf'),
    'Quicksand-Bold': require('@/assets/fonts/Quicksand-Bold.ttf'),
  });

  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <EmergencyProvider>
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
        <StatusBar style="auto" />
      </EmergencyProvider>
    </AuthProvider>
  );
}
