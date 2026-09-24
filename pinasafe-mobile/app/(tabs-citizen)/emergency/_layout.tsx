import { Stack } from 'expo-router/stack';

export default function EmergencyStackLayout() {
  return (
    <Stack>
      <Stack.Screen 
        name="index" 
        options={{ 
          title: 'Emergency',
          headerStyle: { backgroundColor: '#DC2626' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: 'bold' }
        }} 
      />
      <Stack.Screen 
        name="report" 
        options={{ 
          title: 'Report Emergency',
          headerStyle: { backgroundColor: '#DC2626' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: 'bold' }
        }} 
      />
      <Stack.Screen 
        name="call-history" 
        options={{ 
          title: 'Call History',
          headerStyle: { backgroundColor: '#DC2626' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: 'bold' }
        }} 
      />
    </Stack>
  );
}