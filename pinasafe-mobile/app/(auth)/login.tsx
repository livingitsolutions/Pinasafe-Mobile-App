import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import logo from '@/assets/images/logo_pinasafe.png';
import { useAuth } from '@/contexts/AuthContext';
import { Banner, Button, Card, Field, Input, Screen } from '@/components/ui';
import InstallPrompt from '@/components/InstallPrompt';
import { colors, space, type } from '@/theme/tokens';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!email.includes('@') || !password) { setError('Enter a valid email address and password.'); return; }
    setLoading(true); setError('');
    try { const user = await signIn(email.trim(), password); router.replace(user.mustChangePassword ? '/(auth)/change-password' : '/'); }
    catch (cause) { const message = cause instanceof Error ? cause.message : ''; setError(message.includes('Too many') ? 'Too many attempts. Wait before trying again.' : 'Email or password was not accepted.'); }
    finally { setLoading(false); }
  };
  return <Screen style={styles.screen}><View style={styles.brand}><Image source={logo} resizeMode="contain" style={styles.logo} /><Text style={styles.brandName}>PinaSafe</Text><Text style={styles.brandText}>Verified emergency reporting and coordinated response.</Text></View><View style={styles.authColumn}><Card style={styles.card}><Text accessibilityRole="header" style={styles.title}>Sign in</Text><Text style={styles.subtitle}>Sign in to report an emergency or access your response workspace.</Text>{error ? <Banner title="Sign-in unsuccessful" message={error} tone="error" /> : null}<Field label="Email"><Input accessibilityLabel="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" /></Field><Field label="Password"><Input accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" /></Field><Text style={styles.help}>Need account access? Contact your organization administrator.</Text><Button label="Sign in" onPress={submit} loading={loading} /><View style={styles.signup}><Text style={styles.help}>New citizen?</Text><Link href="/(auth)/signup" style={styles.link}>Create an account</Link></View></Card><View style={styles.install}><InstallPrompt /></View></View></Screen>;
}
const styles = StyleSheet.create({ screen: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: space.xl }, brand: { width: '100%', maxWidth: 390 }, logo: { width: 76, height: 76, marginBottom: space.lg }, brandName: { ...type.display, color: colors.ink }, brandText: { ...type.heading, color: colors.muted, marginTop: space.md }, authColumn: { width: '100%', maxWidth: 460, gap: space.lg }, install: { width: '100%' }, card: { width: '100%', maxWidth: 460, gap: space.lg, padding: space.lg }, title: { ...type.display, color: colors.ink }, subtitle: { ...type.body, color: colors.muted }, help: { ...type.caption, color: colors.muted }, signup: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', minHeight: 44, gap: space.sm, justifyContent: 'center' }, link: { ...type.label, color: colors.brand, paddingVertical: space.md } });
