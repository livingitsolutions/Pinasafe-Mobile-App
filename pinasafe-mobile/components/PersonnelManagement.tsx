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
import personnelService, { Personnel, CreatePersonnelInvitationData } from '../services/personnelService';

export default function PersonnelManagement() {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPersonnel, setSelectedPersonnel] = useState<Personnel | null>(null);
  const [filter, setFilter] = useState<'all' | 'staff' | 'rescue_member'>('all');

  const [formData, setFormData] = useState({
    name: '',
    contactNumber: '',
    email: '',
    address: '',
    barangay: '',
    city: '',
    province: '',
    personnelRole: 'staff' as 'staff' | 'rescue_member',
  });

  useEffect(() => {
    loadPersonnel();
  }, []);

  const loadPersonnel = async () => {
    try {
      setLoading(true);
      const data = await personnelService.getAllPersonnel();
      setPersonnel(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load personnel');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.contactNumber || !formData.email) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      const data: CreatePersonnelInvitationData = {
        name: formData.name,
        contactNumber: formData.contactNumber,
        email: formData.email,
        personnelRole: formData.personnelRole,
      };

      await personnelService.invitePersonnel(data);
      Alert.alert('Success', 'Personnel invitation created successfully');
      setModalVisible(false);
      resetForm();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to create personnel invitation');
    } finally {
      setLoading(false);
    }
  };

  function formatPhoneNumber(input: string): string {
  if (!input) return "";

  // Remove non-digits
  let digits = input.replace(/\D/g, "");

  // Normalize to PH format starting with 63
  if (digits.startsWith("0")) {
    digits = "63" + digits.substring(1);
  } else if (!digits.startsWith("63")) {
    digits = "63" + digits;
  }

  // Restrict to PH length (63 + 10 digits)
  digits = digits.substring(0, 12);

  const cc = digits.substring(0, 2);     // 63
  const a = digits.substring(2, 5);      // 912
  const b = digits.substring(5, 8);      // 345
  const c = digits.substring(8, 12);     // 6789

  let formatted = `+${cc}`;
  if (a) formatted += `-${a}`;
  if (b) formatted += `-${b}`;
  if (c) formatted += `-${c}`;

  return formatted;
}

  const handleUpdate = async () => {
    if (!selectedPersonnel) return;

    try {
      setLoading(true);
      await personnelService.updatePersonnel(selectedPersonnel.id, {
        contactNumber: formData.contactNumber,
        email: formData.email || undefined,
        address: formData.address || undefined,
        barangay: formData.barangay || undefined,
        city: formData.city || undefined,
        province: formData.province || undefined,
        personnelRole: formData.personnelRole,
      });
      Alert.alert('Success', 'Personnel updated successfully');
      setModalVisible(false);
      setSelectedPersonnel(null);
      resetForm();
      loadPersonnel();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to update personnel');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert(
      'Confirm Deactivation',
      'Are you sure you want to deactivate this personnel?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              await personnelService.deletePersonnel(id);
              Alert.alert('Success', 'Personnel deactivated successfully');
              loadPersonnel();
            } catch (error) {
              Alert.alert('Error', 'Failed to deactivate personnel');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (person: Personnel) => {
    setSelectedPersonnel(person);
    setFormData({
      name: person.name,
      contactNumber: person.contact_number,
      email: person.email || '',
      address: '',
      barangay: '',
      city: '',
      province: '',
      personnelRole: person.personnel_role,
    });
    setModalVisible(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      contactNumber: '',
      email: '',
      address: '',
      barangay: '',
      city: '',
      province: '',
      personnelRole: 'staff',
    });
    setSelectedPersonnel(null);
  };

  const openCreateModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const filteredPersonnel = personnel.filter((person) => {
    if (filter === 'all') return true;
    return person.personnel_role === filter;
  });

  return (
    <View className="flex-1 bg-gray-50">
      <View className="p-4 bg-white border-b border-gray-200">
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text className="text-2xl font-bold text-gray-800">Users</Text>
            <Text className="text-sm text-gray-600">Manage organization personnel</Text>
          </View>
          <TouchableOpacity
            onPress={openCreateModal}
            className="bg-purple-600 px-4 py-2 rounded-lg"
          >
            <Text className="text-white font-semibold">Add Personnel</Text>
          </TouchableOpacity>
        </View>

        {/* Filter Tabs */}
        <View className="flex-row gap-x-2">
          <TouchableOpacity
            onPress={() => setFilter('all')}
            className={`px-4 py-2 rounded-full ${
              filter === 'all' ? 'bg-purple-600' : 'bg-gray-200'
            }`}
          >
            <Text className={`font-medium ${filter === 'all' ? 'text-white' : 'text-gray-700'}`}>
              All ({personnel.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter('staff')}
            className={`px-4 py-2 rounded-full ${
              filter === 'staff' ? 'bg-purple-600' : 'bg-gray-200'
            }`}
          >
            <Text className={`font-medium ${filter === 'staff' ? 'text-white' : 'text-gray-700'}`}>
              Staff ({personnel.filter(p => p.personnel_role === 'staff').length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter('rescue_member')}
            className={`px-4 py-2 rounded-full ${
              filter === 'rescue_member' ? 'bg-purple-600' : 'bg-gray-200'
            }`}
          >
            <Text className={`font-medium ${filter === 'rescue_member' ? 'text-white' : 'text-gray-700'}`}>
              Rescue Members ({personnel.filter(p => p.personnel_role === 'rescue_member').length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && !modalVisible ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : (
        <ScrollView className="flex-1 p-4">
          {filteredPersonnel.map((person) => (
            <View
              key={person.id}
              className="bg-white p-4 rounded-lg mb-3 shadow-sm border border-gray-100"
            >
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1">
                  <Text className="text-lg font-bold text-gray-800">{person.name}</Text>
                  <Text className="text-sm text-gray-600">{person.position}</Text>
                </View>
                <View
                  className={`px-3 py-1 rounded-full ${
                    person.personnel_role === 'rescue_member'
                      ? 'bg-green-100'
                      : 'bg-blue-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      person.personnel_role === 'rescue_member'
                        ? 'text-green-700'
                        : 'text-blue-700'
                    }`}
                  >
                    {person.personnel_role === 'rescue_member' ? 'Rescue Member' : 'Staff'}
                  </Text>
                </View>
              </View>

              <View className="mt-2 gap-y-1">
                <Text className="text-sm text-gray-600">
                  Contact: {person.contact_number}
                </Text>
                {person.email && (
                  <Text className="text-sm text-gray-600">Email: {person.email}</Text>
                )}
              </View>

              <View className="flex-row justify-end mt-3 gap-x-2">
                <TouchableOpacity
                  onPress={() => openEditModal(person)}
                  className="bg-purple-600 px-4 py-2 rounded-lg mr-2"
                >
                  <Text className="text-white text-sm font-semibold">Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(person.id)}
                  className="bg-red-500 px-4 py-2 rounded-lg"
                >
                  <Text className="text-white text-sm font-semibold">Deactivate</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {filteredPersonnel.length === 0 && (
            <View className="flex-1 justify-center items-center py-20">
              <Text className="text-gray-500 text-center">
                {filter === 'all' ? 'No personnel found' : `No ${filter === 'staff' ? 'staff' : 'rescue members'} found`}
              </Text>
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
              {selectedPersonnel ? 'Edit Personnel' : 'Add Personnel'}
            </Text>

            <ScrollView className="max-h-96">
              <View className="mb-4">
                <Text className="text-sm font-semibold mb-2 text-gray-700">Name *</Text>
                <TextInput
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  placeholder="Enter name"
                  className="border border-gray-300 rounded-lg px-4 py-3"
                  editable={!selectedPersonnel}
                />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-semibold mb-2 text-gray-700">Contact Number *</Text>
                <TextInput
                  value={formData.contactNumber}
                  onChangeText={(text) => setFormData({ ...formData, contactNumber: formatPhoneNumber(text) })}
                  placeholder="Enter contact number"
                  keyboardType="phone-pad"
                  className="border border-gray-300 rounded-lg px-4 py-3"
                />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-semibold mb-2 text-gray-700">
                  Email {selectedPersonnel ? '' : '*'}
                </Text>
                <TextInput
                  value={formData.email}
                  onChangeText={(text) => setFormData({ ...formData, email: text })}
                  placeholder="Enter email"
                  keyboardType="email-address"
                  className="border border-gray-300 rounded-lg px-4 py-3"
                />
              </View>

              {selectedPersonnel && <View className="mb-4">
                <Text className="text-sm font-semibold mb-2 text-gray-700">Street Address</Text>
                <TextInput
                  value={formData.address}
                  onChangeText={(text) => setFormData({ ...formData, address: text })}
                  placeholder="Enter street address"
                  className="border border-gray-300 rounded-lg px-4 py-3"
                />
              </View>}

              {selectedPersonnel && <View className="mb-4">
                <Text className="text-sm font-semibold mb-2 text-gray-700">Barangay</Text>
                <TextInput
                  value={formData.barangay}
                  onChangeText={(text) => setFormData({ ...formData, barangay: text })}
                  placeholder="Enter barangay"
                  className="border border-gray-300 rounded-lg px-4 py-3"
                />
              </View>}

              {selectedPersonnel && <View className="mb-4">
                <Text className="text-sm font-semibold mb-2 text-gray-700">City/Municipality</Text>
                <TextInput
                  value={formData.city}
                  onChangeText={(text) => setFormData({ ...formData, city: text })}
                  placeholder="Enter city/municipality"
                  className="border border-gray-300 rounded-lg px-4 py-3"
                />
              </View>}

              {selectedPersonnel && <View className="mb-4">
                <Text className="text-sm font-semibold mb-2 text-gray-700">Province</Text>
                <TextInput
                  value={formData.province}
                  onChangeText={(text) => setFormData({ ...formData, province: text })}
                  placeholder="Enter province"
                  className="border border-gray-300 rounded-lg px-4 py-3"
                />
              </View>}

              <View className="mb-4">
                <Text className="text-sm font-semibold mb-2 text-gray-700">Role *</Text>
                <View className="flex-row gap-x-2">
                  <TouchableOpacity
                    onPress={() => setFormData({ ...formData, personnelRole: 'staff' })}
                    className={`flex-1 py-3 rounded-lg border ${
                      formData.personnelRole === 'staff'
                        ? 'bg-purple-600 border-purple-600'
                        : 'bg-white border-gray-300'
                    }`}
                  >
                    <Text
                      className={`text-center font-semibold ${
                        formData.personnelRole === 'staff' ? 'text-white' : 'text-gray-700'
                      }`}
                    >
                      Staff
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setFormData({ ...formData, personnelRole: 'rescue_member' })}
                    className={`flex-1 py-3 rounded-lg border ${
                      formData.personnelRole === 'rescue_member'
                        ? 'bg-purple-600 border-purple-600'
                        : 'bg-white border-gray-300'
                    }`}
                  >
                    <Text
                      className={`text-center font-semibold ${
                        formData.personnelRole === 'rescue_member' ? 'text-white' : 'text-gray-700'
                      }`}
                    >
                      Rescue Member
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
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
                onPress={selectedPersonnel ? handleUpdate : handleCreate}
                disabled={loading}
                className="bg-purple-600 px-4 py-3 rounded-lg"
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold">
                    {selectedPersonnel ? 'Update' : 'Create Invitation'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
