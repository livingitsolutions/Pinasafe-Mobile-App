import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { TriangleAlert as AlertTriangle, X, MapPin, Clock, UserCheck, Users, ChevronDown, FileText } from 'lucide-react-native';
import { reactNativeAudioAlertService, IncidentAlert } from '@/services/ReactNativeAudioAlertService';
import { useAuth } from '@/contexts/AuthContext';
import { useEmergency } from '@/contexts/EmergencyContext';
import personnelService from '@/services/personnelService';
import teamService from '@/services/teamService';
import { apiService } from '@/services/apiService';

interface AlertWithReport extends IncidentAlert {
  status?: string;
  assignedTeamId?: string;
}

export const IncidentAlertNotification: React.FC = () => {
  const [alerts, setAlerts] = useState<AlertWithReport[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<AlertWithReport | null>(null);
  const [availablePersonnel, setAvailablePersonnel] = useState<any[]>([]);
  const [availableTeams, setAvailableTeams] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [userTeamId, setUserTeamId] = useState<string | null>(null);

  const { user } = useAuth();
  const { updateReportStatus, clusteredIncidents } = useEmergency();

  useEffect(() => {
    const handleAlertsUpdate = (updatedAlerts: IncidentAlert[]) => {
      setAlerts(updatedAlerts);
    };

    reactNativeAudioAlertService.addListener(handleAlertsUpdate);
    handleAlertsUpdate(reactNativeAudioAlertService.getActiveAlerts());

    return () => {
      reactNativeAudioAlertService.removeListener(handleAlertsUpdate);
    };
  }, []);

  useEffect(() => {
    if (user?.organizationId) {
      if (user.role === 'admin' || user.role === 'super_admin') {
        loadPersonnel();
      }
      loadTeams();
      if (user.role === 'responder') {
        loadUserTeam();
      }
    }
  }, [user?.organizationId, user?.role]);

  const loadUserTeam = async () => {
    try {
      const personnel = await personnelService.getPersonnelByUserId(user!.id);
      if (personnel && personnel.team_id) {
        setUserTeamId(personnel.team_id);
      }
    } catch (error) {
      console.error('Error loading user team:', error);
    }
  };

  const loadPersonnel = async () => {
    try {
      const personnel = await personnelService.getRescueMembers();
      setAvailablePersonnel(personnel.filter(p => p.is_active));
    } catch (error) {
      console.error('Error loading personnel:', error);
      setAvailablePersonnel([]);
    }
  };

  const loadTeams = async () => {
    try {
      const teams = await teamService.getTeams();
      console.log('📋 Loaded teams:', JSON.stringify(teams, null, 2));
      console.log('📋 Teams count:', teams?.length || 0);
      console.log('📋 Teams type:', typeof teams, 'IsArray:', Array.isArray(teams));

      if (!Array.isArray(teams)) {
        console.error('❌ Teams is not an array:', teams);
        setAvailableTeams([]);
        return;
      }

      const reportsResponse = await apiService.getEmergencyReports({ organizationId: user?.organizationId });
      const activeReports = reportsResponse.data?.data || reportsResponse.data || [];

      const busyTeamIds = new Set(
        activeReports
          .filter((r: any) =>
            r.assigned_team_id &&
            (r.status === 'dispatched' || r.status === 'responding')
          )
          .map((r: any) => r.assigned_team_id)
      );

      console.log('🚫 Busy team IDs:', Array.from(busyTeamIds));

      const availableActiveTeams = teams.filter(team => {
        const isActive = team.is_active === true;
        const hasMembers = team.members && team.members.length > 0;
        const isNotBusy = !busyTeamIds.has(team.id);
        console.log(`Team ${team.name}: active=${isActive}, hasMembers=${hasMembers}, available=${isNotBusy}`);
        return isActive && hasMembers && isNotBusy;
      });

      console.log('✅ Available teams:', availableActiveTeams.length);
      setAvailableTeams(availableActiveTeams);
    } catch (error) {
      console.error('❌ Error loading teams:', error);
      setAvailableTeams([]);
    }
  };

  const handleRespond = async (reportId: string) => {
    if (!user) return;

    setIsLoading(true);
    try {
      await updateReportStatus(reportId, 'responding');
      reactNativeAudioAlertService.stopContinuousAlertForReport(reportId);
      await reactNativeAudioAlertService.playAcknowledgment();
      setAlerts(prev => prev.filter(a => a.reportId !== reportId));
    } catch (error) {
      console.error('Error responding to incident:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssignTo = async (alert: IncidentAlert) => {
    setSelectedAlert(alert);
    setIsLoadingTeams(true);
    setShowAssignModal(true);

    try {
      await loadTeams();
      console.log('🔄 Reloaded teams before showing modal');
    } catch (error) {
      console.error('Error reloading teams:', error);
    } finally {
      setIsLoadingTeams(false);
    }
  };

  const assignToPersonnel = async (personnelId: string) => {
    if (!selectedAlert) return;

    setIsLoading(true);
    try {
      await updateReportStatus(selectedAlert.reportId, 'responding');
      reactNativeAudioAlertService.stopContinuousAlertForReport(selectedAlert.reportId);
      await reactNativeAudioAlertService.playAcknowledgment();
      setShowAssignModal(false);
      setSelectedAlert(null);
    } catch (error) {
      console.error('Error assigning incident:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const assignToTeam = async (teamId: string) => {
    if (!selectedAlert) return;

    setIsLoading(true);
    try {
      await apiService.assignTeamToReport(selectedAlert.reportId, teamId);
      reactNativeAudioAlertService.stopContinuousAlertForReport(selectedAlert.reportId);
      await reactNativeAudioAlertService.playAcknowledgment();
      setAlerts(prev => prev.filter(a => a.reportId !== selectedAlert.reportId));
      setShowAssignModal(false);
      setSelectedAlert(null);
    } catch (error) {
      console.error('Error assigning team:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const dismissAlert = (reportId: string) => {
    reactNativeAudioAlertService.stopContinuousAlertForReport(reportId);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'critical':
        return {
          bg: 'bg-red-100',
          border: 'border-red-500',
          text: 'text-red-800',
          badge: 'bg-red-500',
          button: 'bg-red-600',
        };
      case 'high':
        return {
          bg: 'bg-orange-100',
          border: 'border-orange-500',
          text: 'text-orange-800',
          badge: 'bg-orange-500',
          button: 'bg-orange-600',
        };
      case 'medium':
        return {
          bg: 'bg-yellow-100',
          border: 'border-yellow-500',
          text: 'text-yellow-800',
          badge: 'bg-yellow-500',
          button: 'bg-yellow-600',
        };
      default:
        return {
          bg: 'bg-blue-100',
          border: 'border-blue-500',
          text: 'text-blue-800',
          badge: 'bg-blue-500',
          button: 'bg-blue-600',
        };
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - timestamp.getTime()) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const getClusterCount = (reportId: string): number => {
    const cluster = clusteredIncidents.find(c => c.primaryIncident.id === reportId);
    if (!cluster) return 1;
    return 1 + (cluster.relatedIncidents?.length || 0);
  };

  const isAdmin = user?.role === 'admin';
  const isResponder = user?.role === 'responder';

  const filteredAlerts = alerts.filter(alert => {
    if (isAdmin) {
      return alert.status === 'pending';
    }

    if (isResponder) {
      return alert.status === 'dispatched' && alert.assignedTeamId === userTeamId;
    }

    return false;
  });

  if (filteredAlerts.length === 0) return null;

  return (
    <>
      <Modal
        visible={true}
        animationType="fade"
        transparent={false}
        onRequestClose={() => {}}
      >
        <View className="flex-1 bg-gray-900">
          <View className="bg-red-600 px-6 py-8 pt-16">
            <View className="flex-row items-center justify-center gap-3 mb-2">
              <AlertTriangle size={32} color="white" />
              <Text className="text-white font-bold text-2xl">
                EMERGENCY ALERTS
              </Text>
            </View>
            <Text className="text-white text-center text-base">
              {filteredAlerts.length} Active {filteredAlerts.length === 1 ? 'Incident' : 'Incidents'} Requiring Response
            </Text>
          </View>

          <ScrollView className="flex-1 px-4 py-4">
            {filteredAlerts.map((alert, index) => {
              const colors = getPriorityColor(alert.priority);
              return (
                <View
                  key={alert.reportId}
                  className={`bg-white rounded-xl shadow-lg mb-4 overflow-hidden border-l-8 ${colors.border}`}
                >
                  <View className={`${colors.bg} px-4 py-3`}>
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center gap-2 flex-wrap">
                        <View className={`${colors.badge} px-3 py-1 rounded-full`}>
                          <Text className="text-white text-xs font-bold uppercase">
                            {alert.priority} PRIORITY
                          </Text>
                        </View>
                        {getClusterCount(alert.reportId) > 1 && (
                          <View className="bg-gray-800 px-3 py-1 rounded-full">
                            <Text className="text-white text-xs font-bold">
                              {getClusterCount(alert.reportId)} REPORTS
                            </Text>
                          </View>
                        )}
                        <Text className={`${colors.text} font-bold text-lg uppercase`}>
                          {alert.incidentType}
                        </Text>
                      </View>
                    </View>

                    <View className="gap-y-2">
                      <View className="flex-row items-start gap-2">
                        <MapPin size={18} color="#374151" />
                        <View className="flex-1">
                          <Text className="text-gray-700 font-semibold text-sm">Location</Text>
                          <Text className="text-gray-900 text-base">{alert.location}</Text>
                        </View>
                      </View>

                      {alert.description && (
                        <View className="flex-row items-start gap-2">
                          <FileText size={18} color="#374151" />
                          <View className="flex-1">
                            <Text className="text-gray-700 font-semibold text-sm">Description</Text>
                            <Text className="text-gray-900 text-base">{alert.description}</Text>
                          </View>
                        </View>
                      )}

                      <View className="flex-row items-center gap-2">
                        <Clock size={18} color="#374151" />
                        <View>
                          <Text className="text-gray-700 font-semibold text-sm">Reported</Text>
                          <Text className="text-gray-900 text-base">
                            {formatTimestamp(alert.timestamp)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View className="px-4 py-4 bg-white">
                    <View className="flex-row gap-2">
                      {isResponder && (
                        <TouchableOpacity
                          onPress={() => handleRespond(alert.reportId)}
                          disabled={isLoading}
                          className={`flex-1 ${colors.button} py-4 rounded-lg flex-row items-center justify-center gap-2`}
                        >
                          {isLoading ? (
                            <ActivityIndicator color="white" />
                          ) : (
                            <>
                              <UserCheck size={20} color="white" />
                              <Text className="text-white font-bold text-base">
                                RESPOND
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}

                      {isAdmin && (
                        <TouchableOpacity
                          onPress={() => handleAssignTo(alert)}
                          disabled={isLoading}
                          className={`flex-1 ${colors.button} py-4 rounded-lg flex-row items-center justify-center gap-2`}
                        >
                          {isLoading ? (
                            <ActivityIndicator color="white" />
                          ) : (
                            <>
                              <Users size={20} color="white" />
                              <Text className="text-white font-bold text-base">
                                ASSIGN TO
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        onPress={() => dismissAlert(alert.reportId)}
                        className="bg-gray-600 px-4 py-4 rounded-lg"
                      >
                        <X size={20} color="white" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={showAssignModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAssignModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl px-6 py-6 max-h-[70%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-bold text-gray-900">Assign Team</Text>
              <TouchableOpacity
                onPress={() => setShowAssignModal(false)}
                className="bg-gray-200 rounded-full p-2"
              >
                <X size={20} color="#374151" />
              </TouchableOpacity>
            </View>

            {selectedAlert && (
              <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <Text className="text-red-800 font-bold text-sm uppercase mb-1">
                  {selectedAlert.incidentType}
                </Text>
                <Text className="text-gray-700 text-sm">{selectedAlert.location}</Text>
                {selectedAlert.description && (
                  <Text className="text-gray-600 text-xs mt-1">{selectedAlert.description}</Text>
                )}
              </View>
            )}

            <ScrollView >
              {isLoadingTeams ? (
                <View className="py-8">
                  <ActivityIndicator size="large" color="#3B82F6" />
                  <Text className="text-gray-500 text-center mt-4">
                    Loading teams...
                  </Text>
                </View>
              ) : !availableTeams || availableTeams.length === 0 ? (
                <View className="py-8">
                  <Text className="text-gray-500 text-center">
                    No teams available at the moment
                  </Text>
                  <Text className="text-gray-400 text-center text-xs mt-2">
                    All teams may be currently responding to other incidents
                  </Text>
                </View>
              ) : (
                availableTeams.map((team) => (
                  <TouchableOpacity
                    key={team.id}
                    onPress={() => assignToTeam(team.id)}
                    disabled={isLoading}
                    className="bg-gray-50 rounded-lg p-4 mb-3 border border-gray-200"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2 mb-1">
                          <Users size={18} color="#3B82F6" strokeWidth={2} />
                          <Text className="text-gray-900 font-bold text-base">
                            {team.name}
                          </Text>
                        </View>
                        {team.team_leader && (
                          <Text className="text-gray-600 text-sm ml-6">
                            Leader: {team.team_leader.name}
                          </Text>
                        )}
                        <View className="flex-row items-center gap-2 mt-1 ml-6">
                          <View className="px-2 py-1 rounded-full bg-blue-100">
                            <Text className="text-xs font-medium text-blue-800">
                              {team.members?.length || 0} MEMBERS
                            </Text>
                          </View>
                          {team.is_active && (
                            <View className="px-2 py-1 rounded-full bg-green-100">
                              <Text className="text-xs font-medium text-green-800">
                                ACTIVE
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <ChevronDown size={20} color="#9CA3AF" style={{ transform: [{ rotate: '-90deg' }] }} />
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};
