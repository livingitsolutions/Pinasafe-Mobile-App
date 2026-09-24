import React from 'react';
import ProfileScreen from '@/components/ProfileScreen';

function CitizenProfile() {
  return <ProfileScreen userRole="citizen" />;
}

export default React.memo(CitizenProfile);