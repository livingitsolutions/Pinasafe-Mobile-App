import logo from '@/assets/images/onboarding1.2.png';
import { apiService } from '@/services/apiService';
import {
  createInvitationAcceptanceController,
  InvitationAcceptanceError,
  MIN_PERSONNEL_PASSWORD_LENGTH,
} from '@/utils/personnelInvitation';
import { router, useLocalSearchParams } from 'expo-router';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ERROR_MESSAGES: Record<InvitationAcceptanceError, string> = {
  invalid: 'This invitation link is invalid. Ask your administrator for a new invitation.',
  unavailable: 'This invitation is no longer available, or an account already uses its details.',
  expired: 'This invitation has expired. Ask your administrator to create a new one.',
  generic: 'The invitation could not be accepted. Check your connection and try again.',
};

export default function AcceptPersonnelInvitationScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [, render] = useState(0);
  const controller = useRef(
    createInvitationAcceptanceController((invitationToken, newPassword) =>
      apiService.acceptPersonnelInvitation(invitationToken, newPassword)
    )
  ).current;

  const submit = async () => {
    if (controller.state.submitting) return;
    const submission = controller.submit(token, password, confirmPassword);
    render(value => value + 1);
    const accepted = await submission;
    render(value => value + 1);
    if (accepted) {
      router.replace('/(auth)/login');
    }
  };

  const inlineMessage = controller.state.validationError
    ?? (controller.state.error ? ERROR_MESSAGES[controller.state.error] : null)
    ?? (!token ? 'This invitation link is missing its token.' : null);

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow justify-center px-6 py-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-lg self-center overflow-hidden rounded-3xl bg-white">
          <View className="bg-blue-100 px-7 pb-7 pt-8">
            <View className="mb-6 h-16 w-16 items-center justify-center rounded-2xl bg-blue-300">
              <Image source={logo} className="h-12 w-12" resizeMode="contain" />
            </View>
            <Text className="mb-2 text-3xl font-bold text-slate-950">Join your response team</Text>
            <Text className="text-base leading-6 text-slate-700">
              Set a password to finish activating your PinaSafe personnel account.
            </Text>
          </View>

          <View className="px-7 pb-8 pt-7">
            <View className="mb-5 flex-row items-center rounded-xl border border-blue-200 bg-blue-50 p-3">
              <ShieldCheck size={22} color="#1D4ED8" />
              <Text className="ml-3 flex-1 text-sm leading-5 text-blue-900">
                Invitation links are private. Only continue if your organization sent this link.
              </Text>
            </View>

            <Text className="mb-2 font-semibold text-slate-800">New Password</Text>
            <View className="mb-4 flex-row items-center rounded-xl border border-slate-300 bg-slate-50 px-4 py-3">
              <Lock size={20} color="#64748B" />
              <TextInput
                className="ml-3 flex-1 text-slate-950"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                placeholder={`At least ${MIN_PERSONNEL_PASSWORD_LENGTH} characters`}
              />
              <TouchableOpacity onPress={() => setShowPassword(value => !value)} accessibilityLabel="Show or hide password">
                {showPassword
                  ? <EyeOff size={20} color="#64748B" />
                  : <Eye size={20} color="#64748B" />}
              </TouchableOpacity>
            </View>

            <Text className="mb-2 font-semibold text-slate-800">Confirm Password</Text>
            <View className="mb-4 flex-row items-center rounded-xl border border-slate-300 bg-slate-50 px-4 py-3">
              <Lock size={20} color="#64748B" />
              <TextInput
                className="ml-3 flex-1 text-slate-950"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                placeholder="Re-enter your password"
              />
            </View>

            {inlineMessage && (
              <View className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
                <Text className="text-sm leading-5 text-red-800">{inlineMessage}</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={submit}
              disabled={!token || controller.state.submitting}
              className={`rounded-xl py-4 ${!token || controller.state.submitting ? 'bg-slate-400' : 'bg-red-600'}`}
              accessibilityRole="button"
            >
              {controller.state.submitting
                ? <ActivityIndicator color="white" />
                : <Text className="text-center text-base font-bold text-white">Accept Invitation</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.replace('/(auth)/login')} className="mt-4 py-2">
              <Text className="text-center font-semibold text-slate-600">Return to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
