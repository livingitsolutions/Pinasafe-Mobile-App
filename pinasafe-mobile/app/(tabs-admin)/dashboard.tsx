import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart3, Users, AlertTriangle, Activity, MapPin } from 'lucide-react-native';
import { useEmergency } from '@/contexts/EmergencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/apiService';
import { incidentClusteringService } from '@/hooks/incidentClusteringService';
import { IncidentAlertNotification } from '@/components/IncidentAlertNotification';

// -------------------- Types --------------------
type PersonnelStatus = 'on_duty' | 'available' | 'responding' | 'off_duty';

interface Personnel {
  id: string;
  name: string;
  status: PersonnelStatus;
}

interface Organization {
  id: string;
  name: string;
  type: string;
  activePersonnel: Personnel[];
}

interface TeamReadiness {
  id: string;
  name: string;
  description: string;
  team_leader: any;
  total_members: number;
  active_members: number;
  on_duty: number;
  available: number;
  responding: number;
  readiness: number;
  members: any[];
}

interface OrgReadiness {
  id: string;
  name: string;
  type: string;
  readiness: number;
  personnel: {
    total: number;
    active: number;
    rescue_members: number;
    staff: number;
    on_duty: number;
    available: number;
    responding: number;
  };
  teams: TeamReadiness[];
}

// -------------------- Reusable Cards --------------------
const TeamCard = ({ team }: { team: TeamReadiness }) => (
  <View className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-200">
    <View className="flex-row items-center justify-between mb-2">
      <View className="flex-1">
        <Text className="font-semibold text-gray-900">{team.name}</Text>
        {team.team_leader && (
          <Text className="text-xs text-gray-500">Leader: {team.team_leader.name}</Text>
        )}
      </View>
      <View
        className={`px-2 py-1 rounded-full ${
          team.readiness >= 80
            ? 'bg-green-100'
            : team.readiness >= 60
            ? 'bg-amber-100'
            : 'bg-red-100'
        }`}
      >
        <Text
          className={`text-xs font-medium ${
            team.readiness >= 80
              ? 'text-green-800'
              : team.readiness >= 60
              ? 'text-amber-800'
              : 'text-red-800'
          }`}
        >
          {team.readiness}%
        </Text>
      </View>
    </View>
    <View className="flex-row flex-wrap gap-2">
      <View className="flex-row items-center">
        <View className="w-2 h-2 rounded-full bg-blue-500 mr-1" />
        <Text className="text-xs text-gray-600">Members: {team.total_members}</Text>
      </View>
      <View className="flex-row items-center">
        <View className="w-2 h-2 rounded-full bg-green-500 mr-1" />
        <Text className="text-xs text-gray-600">Active: {team.active_members}</Text>
      </View>
      <View className="flex-row items-center">
        <View className="w-2 h-2 rounded-full bg-purple-500 mr-1" />
        <Text className="text-xs text-gray-600">On Duty: {team.on_duty}</Text>
      </View>
      {team.responding > 0 && (
        <View className="flex-row items-center">
          <View className="w-2 h-2 rounded-full bg-red-500 mr-1" />
          <Text className="text-xs text-gray-600">Responding: {team.responding}</Text>
        </View>
      )}
    </View>
  </View>
);

const OrganizationCard = ({ org }: { org: OrgReadiness }) => (
  <View className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
    <View className="flex-row items-center justify-between mb-3">
      <View>
        <Text className="font-bold text-lg text-gray-900">{org.name}</Text>
        <Text className="text-xs text-gray-500 capitalize">{org.type}</Text>
      </View>
      {org.personnel.total > 0 && (
        <View
          className={`px-3 py-1.5 rounded-full ${
            org.readiness >= 80
              ? 'bg-green-100'
              : org.readiness >= 60
              ? 'bg-amber-100'
              : 'bg-red-100'
          }`}
        >
          <Text
            className={`text-sm font-bold ${
              org.readiness >= 80
                ? 'text-green-800'
                : org.readiness >= 60
                ? 'text-amber-800'
                : 'text-red-800'
            }`}
          >
            {org.readiness}% Ready
          </Text>
        </View>
      )}
    </View>

    {/* Personnel Stats */}
    <View className="bg-gray-50 rounded-lg p-3 mb-3">
      <Text className="text-xs font-semibold text-gray-700 mb-2">Personnel Overview</Text>
      <View className="flex-row justify-between">
        <View className="items-center">
          <Text className="text-lg font-bold text-gray-900">{org.personnel.total}</Text>
          <Text className="text-xs text-gray-500">Total</Text>
        </View>
        <View className="items-center">
          <Text className="text-lg font-bold text-green-600">{org.personnel.on_duty}</Text>
          <Text className="text-xs text-gray-500">On Duty</Text>
        </View>
        <View className="items-center">
          <Text className="text-lg font-bold text-blue-600">{org.personnel.available}</Text>
          <Text className="text-xs text-gray-500">Available</Text>
        </View>
        <View className="items-center">
          <Text className="text-lg font-bold text-amber-600">{org.personnel.responding}</Text>
          <Text className="text-xs text-gray-500">Responding</Text>
        </View>
      </View>
      <View className="flex-row justify-around mt-2 pt-2 border-t border-gray-200">
        <Text className="text-xs text-gray-600">Rescue: {org.personnel.rescue_members}</Text>
        <Text className="text-xs text-gray-600">Staff: {org.personnel.staff}</Text>
      </View>
    </View>

    {/* Teams */}
    {org.teams && org.teams.length > 0 && (
      <View>
        <Text className="text-xs font-semibold text-gray-700 mb-2">
          Teams ({org.teams.length})
        </Text>
        {org.teams.map((team) => (
          <TeamCard key={team.id} team={team} />
        ))}
      </View>
    )}
  </View>
);

// -------------------- Dashboard --------------------
const AdminDashboard: React.FC = () => {
  const { getEmergencyStats, getClusteredIncidents, getClusterStatistics } = useEmergency();
  const stats = useMemo(() => getEmergencyStats(), [getEmergencyStats]);
  const clusteredIncidents = useMemo(() => getClusteredIncidents(), [getClusteredIncidents]);
  const clusterStats = useMemo(() => getClusterStatistics(), [getClusterStatistics]);

  const [readinessData, setReadinessData] = useState<OrgReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    console.log("🚨 Clustered incidents:", clusteredIncidents);
  }, [clusteredIncidents]);

  const loadReadinessData = useCallback(async () => {
    try {
      const response = await apiService.getOrganizationReadiness();
      if (response.data?.data) {
        setReadinessData(response.data.data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to load readiness data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReadinessData();
    setRefreshing(false);
  }, [loadReadinessData]);

  // -------------------- State --------------------
  const [prevSnapshot, setPrevSnapshot] = useState<{
    stats: typeof stats;
    clusterStats: typeof clusterStats;
    clusteredIncidents: typeof clusteredIncidents;
  } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // -------------------- Update Snapshot --------------------
  useEffect(() => {
    if (stats && clusterStats && clusteredIncidents) {
      setPrevSnapshot({ stats, clusterStats, clusteredIncidents });
      setLastUpdated(new Date());
    }
  }, [stats, clusterStats, clusteredIncidents]);

  // -------------------- Current Values --------------------
  const activeClustersNow = clusteredIncidents.filter((c) => c.status !== 'resolved').length;
  const totalIncidentsNow = stats.totalReports ?? 0;
  const avgPerClusterNow = Math.round(clusterStats.averageIncidentsPerCluster ?? 0);

  // -------------------- Previous Values --------------------
  const prevActiveClusters = prevSnapshot
    ? prevSnapshot.clusteredIncidents.filter((c) => c.status !== 'resolved').length
    : activeClustersNow;
  const prevTotalIncidents = prevSnapshot?.stats.totalReports ?? totalIncidentsNow;
  const prevAvgPerCluster = Math.round(prevSnapshot?.clusterStats.averageIncidentsPerCluster ?? avgPerClusterNow);
  const prevResponseTime = prevSnapshot ? parseFloat(prevSnapshot.stats.averageResponseTime) : parseFloat(stats.averageResponseTime);

  // -------------------- Deltas --------------------
  const activeClusterChange = activeClustersNow - prevActiveClusters;
  const totalIncidentsChange = totalIncidentsNow - prevTotalIncidents;
  const avgPerClusterChange = avgPerClusterNow - prevAvgPerCluster;
  const responseTimeChange = parseFloat(stats.averageResponseTime) - prevResponseTime;

  // -------------------- Stats Cards --------------------
  const statsCards = [
    {
      title: 'Active Clusters',
      value: activeClustersNow.toString(),
      change: `${activeClusterChange >= 0 ? '+' : ''}${activeClusterChange}`,
      icon: AlertTriangle,
      color: 'bg-red-500',
    },
    {
      title: 'Total Incidents',
      value: totalIncidentsNow.toString(),
      change: `${totalIncidentsChange >= 0 ? '+' : ''}${totalIncidentsChange}`,
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      title: 'Response Time',
      value: stats.averageResponseTime || '0m',
      change: `${responseTimeChange >= 0 ? '+' : ''}${responseTimeChange.toFixed(1)}m`,
      icon: Activity,
      color: 'bg-green-500',
    },
    {
      title: 'Avg per Cluster',
      value: avgPerClusterNow.toString(),
      change: `${avgPerClusterChange >= 0 ? '+' : ''}${avgPerClusterChange}`,
      icon: MapPin,
      color: 'bg-purple-500',
    },
  ];






  

  // Load readiness data on mount
  useEffect(() => {
    loadReadinessData();
  }, [loadReadinessData]);

  const { user } = useAuth();

  if (loading) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-gray-600">Loading readiness data...</Text>
      </SafeAreaView>
    );
  }

  // Time formatting
  const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const reportTime = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - reportTime.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  };

  // // System stats cards
  // const statsCards = [
  //   {
  //     title: 'Active Clusters',
  //     value: clusteredIncidents.filter((c) => c.status !== 'resolved').length.toString(),
  //     change: activeChange.toString(),
  //     icon: AlertTriangle,
  //     color: 'bg-red-500',
  //   },
  //   {
  //     title: 'Total Incidents',
  //     value: stats.totalReports.toString(),
  //     change: `+${incidentChange}`,
  //     icon: Users,
  //     color: 'bg-blue-500',
  //   },
  //   {
  //     title: 'Response Time',
  //     value: stats.averageResponseTime || '0m',
  //     change: `${responseTimeChange > 0 ? '+' : ''}${responseTimeChange}m`,
  //     icon: Activity,
  //     color: 'bg-green-500',
  //   },
  //   {
  //     title: 'Avg per Cluster',
  //     value: Math.round(clusterStats.averageIncidentsPerCluster ?? 0).toString(),
  //     change: `${clusterStats.totalClusters ?? 0}`,
  //     icon: MapPin,
  //     color: 'bg-purple-500',
  //   },
  // ];

  // Active incidents list
  const recentIncidents = clusteredIncidents
    .filter((cluster) => cluster.status !== 'resolved')
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .slice(0, 5)
    .map((cluster) => {
      const formatted = incidentClusteringService.formatClusterForDisplay(cluster);
      return {
        id: cluster.id,
        type: `${cluster.type.charAt(0).toUpperCase() + cluster.type.slice(1)} ${
          cluster.totalReports > 1 ? 'Cluster' : 'Emergency'
        }`,
        location: cluster.affectedArea,
        time: getTimeAgo(cluster.lastUpdated),
        status: cluster.status.charAt(0).toUpperCase() + cluster.status.slice(1),
        badge:
          cluster.totalReports > 1
            ? `${cluster.totalReports} ${cluster.type} reports`
            : `Single ${cluster.type}`,
        totalReports: cluster.totalReports,
      };
    });

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top','left','right']}>
      <IncidentAlertNotification />
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#9333EA']} />
        }
      >
        {/* Header */}
        <View className="bg-white px-6 py-6 shadow-sm">
          <Text className="text-2xl font-bold text-gray-900">Admin Dashboard</Text>
          <Text className="text-gray-600 mt-1">PinaSafe Control Center</Text>
        </View>

        {/* Stats Cards */}
        <View className="px-6 mt-4">
          <Text className="text-lg font-bold text-gray-900 mb-3">System Overview</Text>
          <View className="flex-row flex-wrap justify-between">
            {statsCards.map((stat, index) => (
              <View key={index} className="w-[48%] bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
                <View className="flex-row items-center justify-between mb-2">
                  <View className={`${stat.color} p-2 rounded-lg`}>
                    <stat.icon size={20} color="#FFFFFF" strokeWidth={1.5} />
                  </View>
                  <Text className="text-green-600 text-sm font-medium">{stat.change}</Text>
                </View>
                <Text className="text-2xl font-bold text-gray-900">{stat.value}</Text>
                <Text className="text-gray-600 text-sm">{stat.title}</Text>

                {lastUpdated && (
                  <Text className="text-xs text-green-500 mt-1">
                    Last updated {Math.floor((Date.now() - lastUpdated.getTime()) / 1000)}s ago
                  </Text>
                )}
              </View>
            ))}

            
          </View>
        </View>

        {/* Recent Incidents */}
        <View className="px-6 mt-6">
          <Text className="text-lg font-bold text-gray-900 mb-3">Active Incident Clusters</Text>
          <View className="bg-white rounded-xl shadow-sm border border-gray-100">
            {recentIncidents.map((incident, index) => (
              <TouchableOpacity
                key={incident.id}
                className={`p-4 ${index < recentIncidents.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="font-semibold text-gray-900">{incident.type}</Text>
                    {incident.totalReports > 1 && (
                      <View className="bg-blue-100 px-2 py-1 rounded-full mt-1 self-start">
                        <Text className="text-blue-800 text-xs font-medium">{incident.badge}</Text>
                      </View>
                    )}
                    <Text className="text-gray-600 text-sm">{incident.location}</Text>
                    <Text className="text-gray-500 text-xs mt-1">{incident.time}</Text>
                  </View>
                  <View className={`px-3 py-1 rounded-full ${
                    incident.status === 'Active' ? 'bg-red-100' :
                    incident.status === 'Responding' ? 'bg-amber-100' : 'bg-green-100'
                  }`}>
                    <Text className={`text-xs font-medium ${
                      incident.status === 'Active' ? 'text-red-800' :
                      incident.status === 'Responding' ? 'text-amber-800' : 'text-green-800'
                    }`}>
                      {incident.status}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            {recentIncidents.length === 0 && (
              <View className="p-4 text-center">
                <Text className="text-gray-500">No active incident clusters</Text>
              </View>
            )}
          </View>
        </View>

        {/* Organization & Team Readiness */}
        <View className="px-6 mt-6 mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-3">Organization & Team Readiness</Text>
          {readinessData.length > 0 ? (
            readinessData.map((org) => (
              <OrganizationCard key={org.id} org={org} />
            ))
          ) : (
            <View className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <Text className="text-gray-500 text-center">No organization data available</Text>
            </View>
          )}
        </View>

        
      </ScrollView>
    </SafeAreaView>
  );
};

export default React.memo(AdminDashboard);
