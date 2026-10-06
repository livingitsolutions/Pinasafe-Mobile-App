import React, { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { apiService } from '@/services/apiService';
import { createInvitationAcceptanceController, InvitationAcceptanceError, MIN_PERSONNEL_PASSWORD_LENGTH } from '@/utils/personnelInvitation';
import { Banner, Button, Card, Field, Input, Screen } from '@/components/ui';
import { colors, space, type } from '@/theme/tokens';

const messages: Record<InvitationAcceptanceError, string> = { invalid: 'This invitation link is invalid. Ask your administrator for a new invitation.', unavailable: 'This invitation is no longer available or was already used.', expired: 'This invitation expired. Ask your administrator to create a new one.', generic: 'The invitation could not be accepted. Check your connection and try again.' };
export default function AcceptInvitation() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [, render] = useState(0);
  const controller = useRef(createInvitationAcceptanceController((capability, value) => apiService.acceptPersonnelInvitation(capability, value))).current;
  const submit = async () => { const operation = controller.submit(token, password, confirm); render(i => i + 1); const accepted = await operation; render(i => i + 1); if (accepted) router.replace('/(auth)/login'); };
  const message = controller.state.validationError || (controller.state.error ? messages[controller.state.error] : !token ? 'This invitation link is incomplete. Ask your administrator for a new link.' : '');
  return <Screen style={styles.screen}><Card style={styles.card}><ShieldCheck size={34} color={colors.brand} /><Text style={styles.title}>Join your response organization</Text><Text style={styles.body}>Set a password to activate the personnel account created for you.</Text><Banner title="Private one-time invitation" message="Continue only if your organization shared this link directly. Closing or sharing it may prevent secure activation." tone="warning" />{message ? <Banner title="Invitation needs attention" message={message} tone="error" /> : null}<Field label="New password" hint={`At least ${MIN_PERSONNEL_PASSWORD_LENGTH} characters`}><Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" /></Field><Field label="Confirm password"><Input value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" /></Field><Button label="Accept invitation" onPress={submit} loading={controller.state.submitting} disabled={!token} /><Button variant="quiet" label="Return to sign in" onPress={() => router.replace('/(auth)/login')} /></Card></Screen>;
}
const styles = StyleSheet.create({ screen: { justifyContent: 'center' }, card: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: space.lg, gap: space.lg }, title: { ...type.display, color: colors.ink }, body: { ...type.body, color: colors.muted } });
