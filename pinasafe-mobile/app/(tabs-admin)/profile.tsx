import React from 'react';
import ProfileScreen from '@/components/ProfileScreen';

const AdminProfile: React.FC = () => {
  return <ProfileScreen userRole="admin" />;
}

export default React.memo(AdminProfile);