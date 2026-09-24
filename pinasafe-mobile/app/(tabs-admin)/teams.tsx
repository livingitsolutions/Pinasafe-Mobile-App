import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import TeamManagement from '@/components/TeamManagement';

const AdminTeams: React.FC = () => {
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <TeamManagement />
    </SafeAreaView>
  );
}

export default React.memo(AdminTeams);
