import AutocompleteInput from '@/components/AutocompleteInput';
import { useAuth } from '@/contexts/AuthContext';
import { philippineLocationsAPI } from '@/services/philippineLocations';
import { Link, router } from 'expo-router';
import { Eye, EyeOff, Lock, Mail, MapPin, Phone, Shield, User } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignUpScreen() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    streetName: '',
    selectedCity: '',
    selectedCityName: '',
    selectedBarangay: '',
    selectedBarangayName: '',
    selectedProvince: '',
    country: 'Philippines',
    zipcode: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cityOptions, setCityOptions] = useState<Array<{label: string, value: string, subtitle: string, zipCode: string}>>([]);
  const [barangayOptions, setBarangayOptions] = useState<Array<{label: string, value: string}>>([]);
  const [provinceOptions, setProvinceOptions] = useState<Array<{label: string, value: string, subtitle: string}>>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const { signUp } = useAuth();

  useEffect(() => {
    loadLocationData();
  }, []);

  const loadLocationData = async () => {
    try {
      setIsLoadingLocations(true);
      const [cities, provinces] = await Promise.all([
        philippineLocationsAPI.getCityOptions(),
        philippineLocationsAPI.getProvinceOptions()
      ]);
      setCityOptions(cities);
      setProvinceOptions(provinces);
    } catch (error) {
      console.error('Error loading location data:', error);
    } finally {
      setIsLoadingLocations(false);
    }
  };

  const loadBarangays = async (cityCode: string) => {
    try {
      const barangays = await philippineLocationsAPI.getBarangayOptions(cityCode);
      setBarangayOptions(barangays);
    } catch (error) {
      console.error('Error loading barangays:', error);
      setBarangayOptions([]);
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


  const handleSignUp = async () => {
    const { name, email, phone, streetName, selectedCityName, selectedBarangayName, selectedProvince, country, zipcode, password, confirmPassword } = formData;

    if (!name || !email || !phone || !streetName || !selectedCityName || !selectedBarangayName || !selectedProvince || !country || !zipcode || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (!email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (phone.length < 10) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }

    if (zipcode.length < 4) {
      Alert.alert('Error', 'Please enter a valid zip code');
      return;
    }

    setIsLoading(true);
    try {
      const profile = await signUp(email, password, { 
        name: name.trim(), 
        phone: phone.trim(), 
        streetName: streetName.trim(),
        selectedCityName: selectedCityName,
        selectedBarangayName: selectedBarangayName,
        province: selectedProvince,
        country: country.trim(),
        zipcode: zipcode.trim()
      });
      
      Alert.alert(
        '🎉 Welcome to PinaSafe!', 
        `Account created successfully!\n\nHello ${name} from Brgy. ${selectedBarangayName}, ${selectedCityName}!\n\nYou're now registered as a citizen in the emergency response system.\n\nYou can now:\n• Report emergencies\n• Access emergency contacts\n• Receive safety alerts`, 
        [
          { 
            text: 'Get Started', 
            onPress: () => {
              // Navigate to citizen dashboard
              router.replace('/(tabs-citizen)/emergency-main');
            }
          }
        ]
      );
    } catch (err: any) {
      console.error('Sign up error:', err);

      let errorMessage = 'Unable to create account. Please try again.';

      if (err?.message?.includes('already registered')) {
        errorMessage = 'This email is already registered. Please use a different email or try signing in.';
      } else if (err?.message?.includes('invalid email')) {
        errorMessage = 'Please enter a valid email address.';
      } else if (err?.message?.includes('weak password')) {
        errorMessage = 'Password is too weak. Please use a stronger password.';
      }

      Alert.alert('Sign Up Failed', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCitySelect = async (cityValue: string, cityLabel: string, cityOption?: any) => {
    updateFormData('selectedCity', cityValue); // Store the value for matching
    updateFormData('selectedCityName', cityLabel);
    updateFormData('selectedBarangay', ''); // Reset barangay when city changes
    updateFormData('selectedBarangayName', ''); // Reset barangay name
    
    // Auto-fill zip code if available
    if (cityOption?.zipCode) {
      updateFormData('zipcode', cityOption.zipCode);
    }
    
    // Load barangays for selected city
    await loadBarangays(cityValue); // Still use code for API calls
    
    // Get and set province
    try {
      const provinceData = await philippineLocationsAPI.getProvinceByCity(cityValue); // Still use code for API calls
      if (provinceData) {
        updateFormData('selectedProvince', provinceData.name);
      }
    } catch (error) {
      console.error('Error getting province:', error);
    }
  };

  const handleBarangaySelect = (barangayValue: string, barangayLabel: string, barangayOption?: any) => {
    updateFormData('selectedBarangay', barangayValue); // Store the value for matching
    updateFormData('selectedBarangayName', barangayLabel);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="flex-1 px-6">
        {/* Header */}
        <View className="items-center mt-8 mb-6">
          <View className="bg-emergency-100 p-6 rounded-full mb-4">
            <Shield size={60} color="#DC2626" strokeWidth={1.5} />
          </View>
          <Text className="text-3xl font-bold text-gray-900 mb-2">Create Account</Text>
          <Text className="text-gray-600 text-center">
            Join PinaSafe Leyte community
          </Text>
        </View>

        {/* Sign Up Form */}
        <View className="gap-y-4">
          <View>
            <Text className="text-gray-700 font-medium mb-2">Full Name</Text>
            <View className="flex-row items-center bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              <User size={20} color="#6B7280" strokeWidth={1.5} />
              <TextInput
                className="flex-1 ml-3 text-gray-900"
                placeholder="Enter your full name"
                value={formData.name}
                onChangeText={(value) => updateFormData('name', value)}
                autoComplete="name"
              />
            </View>
          </View>

          <View>
            <Text className="text-gray-700 font-medium mb-2">Email</Text>
            <View className="flex-row items-center bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              <Mail size={20} color="#6B7280" strokeWidth={1.5} />
              <TextInput
                className="flex-1 ml-3 text-gray-900"
                placeholder="Enter your email"
                value={formData.email}
                onChangeText={(value) => updateFormData('email', value)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
          </View>

          <View>
            <Text className="text-gray-700 font-medium mb-2">Phone Number</Text>
            <View className="flex-row items-center bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              <Phone size={20} color="#6B7280" strokeWidth={1.5} />
              <TextInput
                className="flex-1 ml-3 text-gray-900"
                placeholder="Enter your phone number"
                value={formData.phone}
                onChangeText={(value) => updateFormData('phone', formatPhoneNumber(value))}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
            </View>
          </View>

          <View>
            <Text className="text-gray-700 font-medium mb-2">Street Name</Text>
            <View className="flex-row items-center bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              <MapPin size={20} color="#6B7280" strokeWidth={1.5} />
              <TextInput
                className="flex-1 ml-3 text-gray-900"
                placeholder="Enter your street name"
                value={formData.streetName}
                onChangeText={(value) => updateFormData('streetName', value)}
              />
            </View>
          </View>

          <AutocompleteInput
            label="City/Municipality"
            placeholder="Select your city"
            options={cityOptions}
            value={formData.selectedCity}
            onSelect={handleCitySelect}
            searchable={true}
            required={true}
            disabled={isLoadingLocations}
          />

          <AutocompleteInput
            label="Barangay"
            placeholder="Select your barangay"
            options={barangayOptions}
            value={formData.selectedBarangay}
            onSelect={handleBarangaySelect}
            searchable={true}
            required={true}
            disabled={!formData.selectedCity}
          />

          <View>
            <Text className="text-gray-700 font-medium mb-2">Province</Text>
            <View className="flex-row items-center bg-gray-100 rounded-xl px-4 py-3 border border-gray-200">
              <TextInput
                className="flex-1 text-gray-700"
                placeholder="Province (auto-filled)"
                value={formData.selectedProvince}
                editable={false}
              />
            </View>
          </View>

          <View className="flex-row gap-x-3">
            <View className="flex-1">
              <Text className="text-gray-700 font-medium mb-2">Country</Text>
              <View className="flex-row items-center bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                <TextInput
                  className="flex-1 text-gray-900"
                  placeholder="Country"
                  value={formData.country}
                  onChangeText={(value) => updateFormData('country', value)}
                  autoComplete="country"
                />
              </View>
            </View>
            <View className="flex-1">
              <Text className="text-gray-700 font-medium mb-2">Zip Code</Text>
              <View className="flex-row items-center bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                <TextInput
                  className="flex-1 text-gray-900"
                  placeholder="Zip Code"
                  value={formData.zipcode}
                  onChangeText={(value) => updateFormData('zipcode', value)}
                  keyboardType="numeric"
                  autoComplete="postal-code"
                />
              </View>
            </View>
          </View>

          {/* Combined Address Preview */}
          {(formData.streetName || formData.selectedBarangayName || formData.selectedCityName || formData.selectedProvince) && (
            <View className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <Text className="text-blue-800 font-medium mb-2">📍 Complete Address:</Text>
              <Text className="text-blue-700 text-sm">
                {[
                  formData.streetName,
                  formData.selectedBarangayName ? `${formData.selectedBarangayName}` : '',
                  formData.selectedCityName,
                  formData.selectedProvince,
                  formData.country,
                  formData.zipcode
                ].filter(Boolean).join(', ')}
              </Text>
              
            </View>
          )}

          <View>
            <Text className="text-gray-700 font-medium mb-2">Password</Text>
            <View className="flex-row items-center bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              <Lock size={20} color="#6B7280" strokeWidth={1.5} />
              <TextInput
                className="flex-1 ml-3 text-gray-900"
                placeholder="Create a password"
                value={formData.password}
                onChangeText={(value) => updateFormData('password', value)}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? (
                  <EyeOff size={20} color="#6B7280" strokeWidth={1.5} />
                ) : (
                  <Eye size={20} color="#6B7280" strokeWidth={1.5} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View>
            <Text className="text-gray-700 font-medium mb-2">Confirm Password</Text>
            <View className="flex-row items-center bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              <Lock size={20} color="#6B7280" strokeWidth={1.5} />
              <TextInput
                className="flex-1 ml-3 text-gray-900"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChangeText={(value) => updateFormData('confirmPassword', value)}
                secureTextEntry={!showConfirmPassword}
                autoComplete="new-password"
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                {showConfirmPassword ? (
                  <EyeOff size={20} color="#6B7280" strokeWidth={1.5} />
                ) : (
                  <Eye size={20} color="#6B7280" strokeWidth={1.5} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleSignUp}
            disabled={isLoading}
            className={`rounded-xl py-4 mt-6 ${
              isLoading ? 'bg-gray-400' : 'bg-emergency-600'
            }`}
          >
            <Text className="text-white text-center font-semibold text-lg">
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sign In Link */}
        <View className="flex-row justify-center mt-6 mb-8">
          <Text className="text-gray-600">Already have an account? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text className="text-emergency-600 font-semibold">Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}