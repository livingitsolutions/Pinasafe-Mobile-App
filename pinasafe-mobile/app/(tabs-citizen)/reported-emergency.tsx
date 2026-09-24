import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEmergency } from '@/contexts/EmergencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { MapPin, MoveLeft, Navigation, Users, X } from 'lucide-react-native';
import { LiveTrackingMap } from '@/components/LiveTrackingMap';

function CitizenReports() {
  const [refreshing, setRefreshing] = useState(false);
  const [myReports, setMyReports] = useState<any[]>([]);
  const [trackingModalVisible, setTrackingModalVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);

  const { getReportsByUser } = useEmergency();
  const { user } = useAuth();

  // ✅ TYPE → ICON + LABEL
  const getTypeDisplay = (type: string) => {
    switch (type.toLowerCase()) {
      case 'fire':
        return { icon: '🔥', label: 'Fire Accident' };

      case 'road':
      case 'vehicle_crash':
      case 'vehicular':
      case 'accident':
        return { icon: '🚗', label: 'Road Accident' };

      default:
        return { icon: '⚠️', label: 'Other' };
    }
  };

  const loadMyReports = useCallback(() => {
    if (!user) return;
    const reports = getReportsByUser(user.id);
    console.log('🔄 Loading my reports for user:', user.id);
    console.log('📄 Loaded my reports:', reports?.length || 0);
    setMyReports(reports || []);
  }, [user, getReportsByUser]);

  useEffect(() => {
    loadMyReports();
  }, [loadMyReports]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      loadMyReports();
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  }, [loadMyReports]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#DC2626']}
          />
        }
      >
        {/* Header */}
        <View className="bg-white px-6 py-6 shadow-sm">
          <Text className="text-2xl font-bold text-gray-900">Reported Incidents</Text>
          <Text className="text-gray-600 mt-1">Here are all incidents you reported</Text>
        </View>

        {/* Reports List */}
        <View className="mt-4 px-4">
          {myReports.length === 0 ? (
            <Text className="text-gray-500 text-center mt-10">
              You have not reported any incidents yet.
            </Text>
          ) : (
            myReports.map(report => {
              const { icon, label } = getTypeDisplay(report.type);

              return (
                <View
                  key={report.id}
                  className="bg-white p-4 mb-3 rounded-xl shadow-sm border border-gray-200"
                >
                  <Text className="text-lg font-bold text-gray-800">
                    {icon} {label}
                  </Text>

                  <Text className="text-gray-600 mt-1">{report.description}</Text>

                  <View className="flex-row items-center gap-x-1">
                    <MapPin size={16} color="#059669" strokeWidth={1.5} />
                    <Text className="text-gray-500 text-sm mt-1">{report.location}</Text>
                  </View>

                  <Text className="text-sm mt-1">
                    Status:{' '}
                    <Text
                      className={
                        report.status === 'resolved'
                          ? 'text-green-600'
                          : report.status === 'pending'
                          ? 'text-red-600'
                          : 'text-yellow-600'
                      }
                    >
                      {report.status.toUpperCase()}
                    </Text>
                  </Text>

                  <Text className="text-gray-400 text-xs mt-1">
                    Reported at: {new Date(report.reportedAt).toLocaleString()}
                  </Text>

                  {report.assigned_team_id && (
                    <View className="mt-3 pt-3 border-t border-gray-200">
                      <View className="flex-row items-center mb-2">
                        <Users size={16} color="#3B82F6" strokeWidth={1.5} />
                        <Text className="ml-2 text-sm font-semibold text-gray-700">
                          Assigned Team: {report.assigned_team?.name || 'Team'}
                        </Text>
                      </View>
                      {report.assigned_team?.team_leader && (
                        <Text className="text-xs text-gray-600 ml-6">
                          Leader: {report.assigned_team.team_leader.name}
                        </Text>
                      )}
                    </View>
                  )}

                  {(report.status === 'dispatched' || report.status === 'responding') && report.assigned_team_id && (
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedReport(report);
                        setTrackingModalVisible(true);
                      }}
                      className="mt-3 bg-blue-600 py-3 rounded-lg flex-row items-center justify-center"
                    >
                      <Navigation size={20} color="#FFFFFF" strokeWidth={2} />
                      <Text className="text-white font-semibold ml-2">
                        Track Response
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>

      </ScrollView>

      <Modal
        visible={trackingModalVisible}
        animationType="slide"
        onRequestClose={() => setTrackingModalVisible(false)}
      >
        {selectedReport && selectedReport.latitude && selectedReport.longitude && (
          <LiveTrackingMap
            emergencyId={selectedReport.id}
            incidentLocation={{
              latitude: parseFloat(selectedReport.latitude),
              longitude: parseFloat(selectedReport.longitude),
            }}
            incidentType={selectedReport.type}
            onClose={() => setTrackingModalVisible(false)}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

export default React.memo(CitizenReports);
