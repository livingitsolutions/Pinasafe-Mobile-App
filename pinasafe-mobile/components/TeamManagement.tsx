import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import teamService, { RescueTeam, CreateTeamData } from '../services/teamService';
import personnelService from '../services/personnelService';
import type { Personnel } from '../services/personnelService';

export default function TeamManagement() {
  const [teams, setTeams] = useState<RescueTeam[]>([]);
  const [rescueMembers, setRescueMembers] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<RescueTeam | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');

  const [formData, setFormData] = useState({
    name: '',
    teamLeaderId: '',
    description: '',
    selectedMembers: [] as string[],
  });

  useEffect(() => {
    loadTeams();
    loadRescueMembers();
  }, []);

  const loadTeams = async () => {
    try {
      setLoading(true);
      const data = await teamService.getAllTeams();
      setTeams(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  const loadRescueMembers = async () => {
    try {
      const data = await personnelService.getRescueMembers();
      setRescueMembers(data);
    } catch (error) {
      console.error('Failed to load rescue members:', error);
    }
  };

  const handleCreate = async () => {
    if (!formData.name) {
      Alert.alert('Error', 'Please enter a team name');
      return;
    }

    try {
      setLoading(true);
      const data: CreateTeamData = {
        name: formData.name,
        teamLeaderId: formData.teamLeaderId || undefined,
        description: formData.description || undefined,
      };

      const newTeam = await teamService.createTeam(data);

      if (formData.selectedMembers.length > 0) {
        const memberPromises = formData.selectedMembers.map((userId) =>
          teamService.addTeamMember(newTeam.id, { userId })
        );

        await Promise.all(memberPromises);
      }

      Alert.alert('Success', `Team created successfully with ${formData.selectedMembers.length} member(s)`);
      setModalVisible(false);
      resetForm();
      loadTeams();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedTeam) return;

    try {
      setLoading(true);
      await teamService.updateTeam(selectedTeam.id, {
        name: formData.name,
        teamLeaderId: formData.teamLeaderId || undefined,
        description: formData.description || undefined,
      });
      Alert.alert('Success', 'Team updated successfully');
      setModalVisible(false);
      setSelectedTeam(null);
      resetForm();
      loadTeams();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to update team');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert(
      'Confirm Deactivation',
      'Are you sure you want to deactivate this team?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              await teamService.deleteTeam(id);
              Alert.alert('Success', 'Team deactivated successfully');
              loadTeams();
            } catch (error) {
              Alert.alert('Error', 'Failed to deactivate team');
            }
          },
        },
      ]
    );
  };

  const handleAddMember = async () => {
    if (!selectedTeam || !selectedMemberId) {
      Alert.alert('Error', 'Please select a team member');
      return;
    }

    try {
      setLoading(true);
      await teamService.addTeamMember(selectedTeam.id, { userId: selectedMemberId });
      Alert.alert('Success', 'Team member added successfully');
      setMemberModalVisible(false);
      setSelectedMemberId('');
      loadTeams();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to add team member');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (teamId: string, memberId: string) => {
    Alert.alert(
      'Confirm Removal',
      'Are you sure you want to remove this member from the team?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await teamService.removeTeamMember(teamId, memberId);
              Alert.alert('Success', 'Team member removed successfully');
              loadTeams();
            } catch (error) {
              Alert.alert('Error', 'Failed to remove team member');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (team: RescueTeam) => {
    setSelectedTeam(team);
    setFormData({
      name: team.name,
      teamLeaderId: team.team_leader_id || '',
      description: team.description || '',
      selectedMembers: [],
    });
    setModalVisible(true);
  };

  const openMemberModal = (team: RescueTeam) => {
    setSelectedTeam(team);
    setSelectedMemberId('');
    setMemberModalVisible(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      teamLeaderId: '',
      description: '',
      selectedMembers: [],
    });
    setSelectedTeam(null);
  };

  const openCreateModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const getAvailableMembers = () => {
    const allTeamMemberIds = teams.flatMap((team) =>
      team.members.map((m) => m.user_id)
    );

    const teamLeaderIds = teams
      .filter((team) => team.team_leader_id)
      .map((team) => team.team_leader_id);

    if (selectedTeam) {
      const currentTeamMemberIds = selectedTeam.members.map((m) => m.user_id);
      return rescueMembers.filter(
        (member) =>
          member.user_id &&
          member.is_active &&
          member.personnel_role === 'rescue_member' &&
          !currentTeamMemberIds.includes(member.user_id) &&
          !allTeamMemberIds.includes(member.user_id) &&
          !teamLeaderIds.includes(member.user_id)
      );
    }

    return rescueMembers.filter(
      (member) =>
        member.user_id &&
        member.is_active &&
        member.personnel_role === 'rescue_member' &&
        !allTeamMemberIds.includes(member.user_id) &&
        !teamLeaderIds.includes(member.user_id)
    );
  };

  return (
    <View className="flex-1 bg-gray-50">
      <View className="p-4 bg-white border-b border-gray-200">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-2xl font-bold text-gray-800">Teams</Text>
            <Text className="text-sm text-gray-600">Manage rescue teams and members</Text>
          </View>
          <TouchableOpacity
            onPress={openCreateModal}
            className="bg-purple-600 px-4 py-2 rounded-lg"
          >
            <Text className="text-white font-semibold">Add Team</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && !modalVisible && !memberModalVisible ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : (
        <ScrollView className="flex-1 p-4">
          {teams.map((team) => (
            <View
              key={team.id}
              className="bg-white p-4 rounded-lg mb-3 shadow-sm border border-gray-100"
            >
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-1">
                  <Text className="text-lg font-bold text-gray-800">{team.name}</Text>
                  {team.description && (
                    <Text className="text-sm text-gray-600 mt-1">{team.description}</Text>
                  )}
                </View>
              </View>

              {team.team_leader && (
                <View className="mb-3 bg-purple-50 p-3 rounded-lg">
                  <Text className="text-xs font-semibold text-purple-700 mb-1">Team Leader</Text>
                  <Text className="text-sm font-semibold text-gray-800">
                    {team.team_leader.name}
                  </Text>
                  <Text className="text-xs text-gray-600">{team.team_leader.phone}</Text>
                </View>
              )}

              <View className="mb-3">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-sm font-semibold text-gray-700">
                    Team Members ({team.members.length})
                  </Text>
                  <TouchableOpacity
                    onPress={() => openMemberModal(team)}
                    className="bg-purple-600 px-3 py-1 rounded-lg"
                  >
                    <Text className="text-white text-xs font-semibold">Add Member</Text>
                  </TouchableOpacity>
                </View>

                {team.members.length > 0 ? (
                  <View className="gap-y-2">
                    {team.members.map((member) => (
                      <View
                        key={member.id}
                        className="flex-row justify-between items-center bg-gray-50 p-2 rounded"
                      >
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-gray-800">
                            {member.user?.name}
                          </Text>
                          <Text className="text-xs text-gray-600">{member.user?.phone}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleRemoveMember(team.id, member.id)}
                          className="bg-red-500 px-3 py-1 rounded"
                        >
                          <Text className="text-white text-xs">Remove</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text className="text-sm text-gray-500 text-center py-2">
                    No members assigned
                  </Text>
                )}
              </View>

              <View className="flex-row justify-end gap-x-2 pt-3 border-t border-gray-200">
                <TouchableOpacity
                  onPress={() => openEditModal(team)}
                  className="bg-purple-600 px-4 py-2 rounded-lg mr-2"
                >
                  <Text className="text-white text-sm font-semibold">Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(team.id)}
                  className="bg-red-500 px-4 py-2 rounded-lg"
                >
                  <Text className="text-white text-sm font-semibold">Delete Team</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {teams.length === 0 && (
            <View className="flex-1 justify-center items-center py-20">
              <Text className="text-gray-500 text-center">No teams found</Text>
            </View>
          )}
        </ScrollView>
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setModalVisible(false);
          resetForm();
        }}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-white w-11/12 rounded-lg p-6">
            <Text className="text-xl font-bold mb-4">
              {selectedTeam ? 'Edit Team' : 'Create Team'}
            </Text>

            <ScrollView className="max-h-96">
              <View className="mb-4">
                <Text className="text-sm font-semibold mb-2 text-gray-700">Team Name *</Text>
                <TextInput
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  placeholder="Enter team name"
                  className="border border-gray-300 rounded-lg px-4 py-3"
                />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-semibold mb-2 text-gray-700">Team Leader</Text>
                <View className="border border-gray-300 rounded-lg">
                  <ScrollView className="max-h-40">
                    <TouchableOpacity
                      onPress={() => setFormData({ ...formData, teamLeaderId: '' })}
                      className={`px-4 py-3 border-b border-gray-200 ${
                        formData.teamLeaderId === '' ? 'bg-blue-50' : ''
                      }`}
                    >
                      <Text className="text-sm text-gray-700">No Leader</Text>
                    </TouchableOpacity>
                    {rescueMembers.filter(m => m.user_id).map((member) => (
                      <TouchableOpacity
                        key={member.id}
                        onPress={() =>
                          setFormData({ ...formData, teamLeaderId: member.user_id || '' })
                        }
                        className={`px-4 py-3 border-b border-gray-200 ${
                          formData.teamLeaderId === member.user_id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <Text className="text-sm font-semibold text-gray-800">
                          {member.name}
                        </Text>
                        <Text className="text-xs text-gray-600">{member.position}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-sm font-semibold mb-2 text-gray-700">Description</Text>
                <TextInput
                  value={formData.description}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                  placeholder="Enter team description"
                  multiline
                  numberOfLines={3}
                  className="border border-gray-300 rounded-lg px-4 py-3"
                />
              </View>

              {!selectedTeam && (
                <View className="mb-4">
                  <Text className="text-sm font-semibold mb-2 text-gray-700">
                    Team Members ({formData.selectedMembers.length} selected)
                  </Text>
                  <View className="border border-gray-300 rounded-lg">
                    <ScrollView className="max-h-60">
                      {getAvailableMembers().map((member) => {
                        const isSelected = formData.selectedMembers.includes(member.user_id || '');
                        return (
                          <TouchableOpacity
                            key={member.id}
                            onPress={() => {
                              const memberId = member.user_id || '';
                              if (isSelected) {
                                setFormData({
                                  ...formData,
                                  selectedMembers: formData.selectedMembers.filter((id) => id !== memberId),
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  selectedMembers: [...formData.selectedMembers, memberId],
                                });
                              }
                            }}
                            className={`px-4 py-3 border-b border-gray-200 flex-row items-center ${
                              isSelected ? 'bg-purple-50' : ''
                            }`}
                          >
                            <View className={`w-5 h-5 rounded border-2 mr-3 items-center justify-center ${
                              isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-300'
                            }`}>
                              {isSelected && (
                                <Text className="text-white text-xs font-bold">✓</Text>
                              )}
                            </View>
                            <View className="flex-1">
                              <Text className="text-sm font-semibold text-gray-800">
                                {member.name}
                              </Text>
                              <Text className="text-xs text-gray-600">{member.position}</Text>
                              <Text className="text-xs text-gray-500">{member.contact_number}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                      {getAvailableMembers().length === 0 && (
                        <View className="p-4">
                          <Text className="text-sm text-gray-500 text-center">
                            No available rescue members. All active rescue members are already assigned to teams.
                          </Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                  <Text className="text-xs text-gray-500 mt-2">
                    Select multiple members to add to this team
                  </Text>
                </View>
              )}
            </ScrollView>

            <View className="flex-row justify-end mt-4 gap-x-2">
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  resetForm();
                }}
                className="bg-gray-300 px-4 py-3 rounded-lg mr-2"
              >
                <Text className="text-gray-700 font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={selectedTeam ? handleUpdate : handleCreate}
                disabled={loading}
                className="bg-purple-600 px-4 py-3 rounded-lg"
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold">
                    {selectedTeam ? 'Update' : 'Create'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={memberModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setMemberModalVisible(false);
          setSelectedMemberId('');
        }}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-white w-11/12 rounded-lg p-6">
            <Text className="text-xl font-bold mb-4">Add Team Member</Text>

            <Text className="text-sm font-semibold mb-2 text-gray-700">
              Select Rescue Member
            </Text>
            <View className="border border-gray-300 rounded-lg mb-4">
              <ScrollView className="max-h-80">
                {getAvailableMembers().map((member) => (
                  <TouchableOpacity
                    key={member.id}
                    onPress={() => setSelectedMemberId(member.user_id || '')}
                    className={`px-4 py-3 border-b border-gray-200 ${
                      selectedMemberId === member.user_id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <Text className="text-sm font-semibold text-gray-800">{member.name}</Text>
                    <Text className="text-xs text-gray-600">{member.position}</Text>
                    <Text className="text-xs text-gray-600">{member.contact_number}</Text>
                  </TouchableOpacity>
                ))}
                {getAvailableMembers().length === 0 && (
                  <View className="p-4">
                    <Text className="text-sm text-gray-500 text-center">
                      No available rescue members. All active rescue members are already assigned to teams.
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>

            <View className="flex-row justify-end gap-x-2">
              <TouchableOpacity
                onPress={() => {
                  setMemberModalVisible(false);
                  setSelectedMemberId('');
                }}
                className="bg-gray-300 px-4 py-3 rounded-lg mr-2"
              >
                <Text className="text-gray-700 font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddMember}
                disabled={loading || !selectedMemberId}
                className={`px-4 py-3 rounded-lg ${
                  !selectedMemberId ? 'bg-gray-400' : 'bg-blue-500'
                }`}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold">Add Member</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
