import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LogOut, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { Banner, Button, Card, DetailItem, PageHeader, Screen } from '@/components/ui';
import InstallPrompt from '@/components/InstallPrompt';
import { colors, radius, space, type } from '@/theme/tokens';

export default function ProfileScreen() {
  const { user, signOut, isSigningOut } = useAuth();
  const [error, setError] = useState('');
  const logout = async () => { setError(''); try { await signOut(); router.replace('/(auth)/login'); } catch { setError('Sign out could not contact the server. Try again.'); } };
  return <Screen><PageHeader eyebrow="Account" title="Profile and session" description="Your verified identity and organization access." />{error ? <Banner title="Sign-out unsuccessful" message={error} tone="error" /> : null}<Card><View style={styles.identity}><View style={styles.avatar}><Text style={styles.initial}>{user?.name?.slice(0, 1).toUpperCase() || 'P'}</Text></View><View style={{ flex: 1 }}><Text style={styles.name}>{user?.name || 'PinaSafe user'}</Text><Text style={styles.role}>{user?.role?.replace('_', ' ')}</Text></View><ShieldCheck size={24} color={colors.success} /></View><View style={styles.details}><DetailItem label="Email" value={user?.email} /><DetailItem label="Phone" value={user?.phone} /><DetailItem label="Address" value={user?.address} /></View></Card><InstallPrompt /><Banner title="Session security" message="Signing out removes the local access token from this device." tone="info" /><View style={styles.actions}><Button variant="danger" label="Sign out" onPress={logout} loading={isSigningOut} icon={<LogOut size={18} color={colors.white} />} /></View></Screen>;
}
const styles = StyleSheet.create({ identity: { flexDirection: 'row', gap: space.md, alignItems: 'center' }, avatar: { width: 54, height: 54, borderRadius: radius.lg, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }, initial: { ...type.title, color: colors.brand }, name: { ...type.title, color: colors.ink }, role: { ...type.label, color: colors.muted, textTransform: 'capitalize' }, details: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl, marginTop: space.xl, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.border }, actions: { alignItems: 'flex-start' } });
