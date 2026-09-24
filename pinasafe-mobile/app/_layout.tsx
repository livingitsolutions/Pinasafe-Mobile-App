import { AuthProvider } from '@/contexts/AuthContext';
import { EmergencyProvider } from '@/contexts/EmergencyContext';
import "@/globals.css";
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  useFrameworkReady();

  return (
    <AuthProvider>
      <EmergencyProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs-citizen)" />
          <Stack.Screen name="(tabs-responder)" />
          <Stack.Screen name="(tabs-admin)" />
          <Stack.Screen name="index" />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </EmergencyProvider>
    </AuthProvider>
  );
}
