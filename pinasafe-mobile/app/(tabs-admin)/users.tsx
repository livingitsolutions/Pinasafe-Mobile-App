import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import PersonnelManagement from '@/components/PersonnelManagement';

const AdminUsers: React.FC = () => {
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PersonnelManagement />
    </SafeAreaView>
  );
}

export default React.memo(AdminUsers);
