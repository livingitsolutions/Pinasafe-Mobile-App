import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle, Clock3, Phone, Shield } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useEmergency } from '@/contexts/EmergencyContext';
import { Banner, Button, Card, ListRow, PageHeader, Screen, Section, StatusBadge } from '@/components/ui';
import { colors, radius, space, type } from '@/theme/tokens';

export default function CitizenHome() {
  const { user } = useAuth();
  const { reports } = useEmergency();
  const active = reports.filter(report => report.status !== 'resolved');
  return <Screen>
    <PageHeader eyebrow="PinaSafe citizen" title={`Stay safe${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`} description="Report a supported road or fire emergency with live evidence, then follow its verified status." />
    <Card tone="critical" style={styles.hero}><View style={styles.heroIcon}><AlertTriangle size={28} color={colors.brand} /></View><View style={styles.heroCopy}><Text style={styles.heroTitle}>Emergency report</Text><Text style={styles.heroText}>Capture live evidence, verify the AI classification, and submit. The classifier determines the incident type automatically.</Text></View><Button label="Start report" onPress={() => router.push('/(tabs-citizen)/emergency/report')} /></Card>
    <Banner title="Immediate danger?" message="PinaSafe is a reporting tool and does not replace your local emergency hotline. Use the verified emergency number for your location." tone="warning" />
    <Section title="Current incidents" description="Status changes come from the response workflow.">
      {active.length === 0 ? <Card style={styles.calm}><Shield size={24} color={colors.success} /><View style={styles.heroCopy}><Text style={styles.calmTitle}>No active reports</Text><Text style={styles.heroText}>Your submitted incidents that need attention appear here.</Text></View></Card> : <Card>{active.slice(0, 3).map(report => <ListRow key={report.id} title={report.type === 'fire' ? 'Fire incident' : 'Road incident'} subtitle={report.location} trailing={<StatusBadge value={report.status} />} onPress={() => router.push(`/incident/${report.id}`)} />)}<Button variant="quiet" label="View all incidents" onPress={() => router.push('/(tabs-citizen)/reported-emergency')} /></Card>}
    </Section>
    <Section title="Before you report"><View style={styles.guidance}><Card><Clock3 size={22} color={colors.info} /><Text style={styles.guidanceTitle}>Move to safety</Text><Text style={styles.heroText}>Do not capture evidence if doing so places you or others at risk.</Text></Card><Card><Phone size={22} color={colors.info} /><Text style={styles.guidanceTitle}>Use local services</Text><Text style={styles.heroText}>Call a verified local emergency service when voice assistance is urgent.</Text><Button variant="quiet" label="Open phone" onPress={() => Linking.openURL('tel:')} /></Card></View></Section>
  </Screen>;
}

const styles = StyleSheet.create({ hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.lg, padding: space.xl }, heroIcon: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }, heroCopy: { flex: 1, minWidth: 220 }, heroTitle: { ...type.title, color: colors.ink }, heroText: { ...type.body, color: colors.muted, marginTop: space.xs }, calm: { flexDirection: 'row', alignItems: 'center', gap: space.md }, calmTitle: { ...type.heading, color: colors.ink }, guidance: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg }, guidanceTitle: { ...type.heading, color: colors.ink, marginTop: space.md } });
