import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Banner, Button, Card, Field, Input, PageHeader, Screen } from '@/components/ui';
import { colors, space, type } from '@/theme/tokens';

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!form.name.trim() || !form.email.includes('@') || form.password.length < 6 || form.password !== form.confirm) { setError('Complete every required field. Passwords must match and contain at least 6 characters.'); return; }
    setLoading(true); setError('');
    try { await signUp(form.email.trim(), form.password, { name: form.name.trim(), phone: form.phone.trim(), streetName: form.address.trim() }); router.replace('/'); }
    catch (cause) { setError(cause instanceof Error && cause.message.includes('registered') ? 'An account already uses this email.' : 'Your account could not be created. Review the details and try again.'); }
    finally { setLoading(false); }
  };
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  return <Screen style={styles.screen}><View style={styles.wrap}><PageHeader eyebrow="Citizen access" title="Create your PinaSafe account" description="Citizen registration is supported by the backend. Organization personnel join through a private invitation instead." />{error ? <Banner title="Registration needs attention" message={error} tone="error" /> : null}<Card style={styles.form}><Field label="Full name"><Input value={form.name} onChangeText={value => update('name', value)} autoComplete="name" /></Field><Field label="Email"><Input value={form.email} onChangeText={value => update('email', value)} autoCapitalize="none" keyboardType="email-address" /></Field><Field label="Phone" hint="Optional"><Input value={form.phone} onChangeText={value => update('phone', value)} keyboardType="phone-pad" /></Field><Field label="Address" hint="Use your actual address; PinaSafe does not assume a city or province."><Input value={form.address} onChangeText={value => update('address', value)} /></Field><View style={styles.passwords}><View style={styles.flex}><Field label="Password"><Input value={form.password} onChangeText={value => update('password', value)} secureTextEntry /></Field></View><View style={styles.flex}><Field label="Confirm password"><Input value={form.confirm} onChangeText={value => update('confirm', value)} secureTextEntry /></Field></View></View><Button label="Create citizen account" onPress={submit} loading={loading} /><View style={styles.login}><Text style={styles.help}>Already registered?</Text><Link href="/(auth)/login" style={styles.link}>Sign in</Link></View></Card></View></Screen>;
}
const styles = StyleSheet.create({ screen: { justifyContent: 'center' }, wrap: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: space.xl }, form: { gap: space.lg, padding: space.xl }, passwords: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg }, flex: { flex: 1, minWidth: 240 }, login: { flexDirection: 'row', justifyContent: 'center', gap: space.sm }, help: { ...type.caption, color: colors.muted }, link: { ...type.label, color: colors.brand } });
