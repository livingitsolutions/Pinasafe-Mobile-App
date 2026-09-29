import { Stack } from 'expo-router/stack';

export default function EmergencyStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen 
        name="index" 
        options={{ 
          title: 'Emergency',
        }} 
      />
      <Stack.Screen 
        name="report" 
        options={{ 
          title: 'Report Emergency',
        }} 
      />
    </Stack>
  );
}
