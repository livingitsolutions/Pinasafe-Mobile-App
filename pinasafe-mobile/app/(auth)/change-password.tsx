import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { apiService, isApiError } from '@/services/apiService';
import { Banner, Button, Card, Field, Input, Screen } from '@/components/ui';
import { colors, space, type } from '@/theme/tokens';

export default function ChangePassword() {
  const { signOut } = useAuth(); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const submit = async () => { if (password.length < 8 || password !== confirm) { setError('Passwords must match and contain at least 8 characters.'); return; } setLoading(true); setError(''); try { await apiService.post('/auth/change-password', { newPassword: password }); await signOut(); router.replace('/(auth)/login'); } catch (cause) { setError(isApiError(cause) ? cause.message : 'Password could not be changed.'); } finally { setLoading(false); } };
  return <Screen style={styles.screen}><Card style={styles.card}><Text style={styles.title}>Set a new password</Text><Text style={styles.body}>Your temporary credential must be replaced before continuing.</Text>{error ? <Banner title="Password not changed" message={error} tone="error" /> : null}<Field label="New password"><Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" /></Field><Field label="Confirm password"><Input value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" /></Field><Button label="Change password" onPress={submit} loading={loading} /></Card></Screen>;
}
const styles = StyleSheet.create({ screen: { justifyContent: 'center' }, card: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: space.xxl, gap: space.lg }, title: { ...type.display, color: colors.ink }, body: { ...type.body, color: colors.muted } });
