import React from 'react';
import ProfileScreen from '@/components/ProfileScreen';

function ResponderProfile() {
  return <ProfileScreen userRole="responder" />;
}

export default React.memo(ResponderProfile);