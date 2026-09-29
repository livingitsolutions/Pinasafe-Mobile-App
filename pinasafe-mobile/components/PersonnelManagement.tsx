import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import personnelService, { Personnel } from '@/services/personnelService';
import { createPersonnelInvitationResult, PersonnelInvitationResult } from '@/utils/personnelInvitation';
import { Banner, Button, Card, Dialog, EmptyState, ErrorState, Field, Input, ListRow, LoadingState, PageHeader, Screen, StatusBadge } from '@/components/ui';
import { colors, space, type } from '@/theme/tokens';

export default function PersonnelManagement() {
  const [people, setPeople] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<PersonnelInvitationResult | null>(null);
  const [form, setForm] = useState({ name: '', email: '', contactNumber: '', personnelRole: 'rescue_member' as 'staff' | 'rescue_member' });
  const load = useCallback(async () => { setLoading(true); setError(''); try { setPeople(await personnelService.getAllPersonnel()); } catch { setError('Personnel could not be loaded.'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const invite = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.contactNumber.trim()) return;
    setSending(true); setError('');
    try {
      const invitation = await personnelService.invitePersonnel(form);
      const origin = typeof window !== 'undefined' ? window.location.origin : Linking.createURL('').replace(/\/$/, '');
      setResult(createPersonnelInvitationResult(invitation, origin)); setInviteOpen(false);
    } catch { setError('The invitation could not be created. Verify the details and try again.'); }
    finally { setSending(false); }
  };
  const closeResult = () => { setResult(null); setForm({ name: '', email: '', contactNumber: '', personnelRole: 'rescue_member' }); void load(); };

  return <Screen>
    <PageHeader eyebrow="Organization" title="Personnel" description="Manage responders and create one-time invitation capabilities." action={<Button label="Invite personnel" onPress={() => setInviteOpen(true)} />} />
    {error ? <ErrorState message={error} onRetry={load} /> : null}
    {loading ? <LoadingState rows={4} /> : people.length === 0 ? <EmptyState title="No personnel yet" message="Invite a staff member or rescue responder to begin building operational teams." action={<Button label="Create invitation" onPress={() => setInviteOpen(true)} />} /> : <Card>{people.map(person => <ListRow key={person.id} title={person.name} subtitle={`${person.personnel_role === 'rescue_member' ? 'Rescue responder' : 'Staff'}${person.team_id ? ' · Assigned to team' : ' · No team'}`} trailing={<StatusBadge value={person.is_active ? 'active' : 'inactive'} />} />)}</Card>}
    <Dialog visible={inviteOpen} title="Create personnel invitation" onClose={() => setInviteOpen(false)} footer={<View style={styles.actions}><Button variant="secondary" label="Cancel" onPress={() => setInviteOpen(false)} /><Button label="Create secure link" onPress={invite} loading={sending} disabled={!form.name || !form.email || !form.contactNumber} /></View>}>
      <Banner title="No email is sent" message="PinaSafe creates a one-time capability link. Share it securely only with the intended person." tone="warning" />
      <View style={styles.form}><Field label="Full name"><Input value={form.name} onChangeText={name => setForm(value => ({ ...value, name }))} autoComplete="name" /></Field><Field label="Email"><Input value={form.email} onChangeText={email => setForm(value => ({ ...value, email }))} keyboardType="email-address" autoCapitalize="none" /></Field><Field label="Contact number"><Input value={form.contactNumber} onChangeText={contactNumber => setForm(value => ({ ...value, contactNumber }))} keyboardType="phone-pad" /></Field><Field label="Personnel type"><View style={styles.actions}><Button variant={form.personnelRole === 'rescue_member' ? 'primary' : 'secondary'} label="Rescue responder" onPress={() => setForm(value => ({ ...value, personnelRole: 'rescue_member' }))} /><Button variant={form.personnelRole === 'staff' ? 'primary' : 'secondary'} label="Staff" onPress={() => setForm(value => ({ ...value, personnelRole: 'staff' }))} /></View></Field></View>
    </Dialog>
    <Dialog visible={Boolean(result)} title="Invitation ready" onClose={closeResult} footer={<View style={styles.actions}><Button variant="secondary" label="Close" onPress={closeResult} /><Button label="Copy one-time link" onPress={() => result && Clipboard.setStringAsync(result.url)} /></View>}>
      <Banner title="Share once, share securely" message="This link grants account setup access and expires. It is not delivered by email and is not stored by this screen after closing." tone="warning" />
      {result ? <View style={styles.result}><Text style={styles.resultLabel}>For {result.email}</Text><Text selectable={false} numberOfLines={2} style={styles.masked}>Secure invitation link ready to copy</Text><Text style={styles.expiry}>The backend controls capability expiry and one-time use.</Text></View> : null}
    </Dialog>
  </Screen>;
}

const styles = StyleSheet.create({ actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'flex-end' }, form: { gap: space.lg, marginTop: space.lg }, result: { paddingVertical: space.xl, gap: space.sm }, resultLabel: { ...type.heading, color: colors.ink }, masked: { ...type.body, color: colors.brand }, expiry: { ...type.caption, color: colors.muted } });
