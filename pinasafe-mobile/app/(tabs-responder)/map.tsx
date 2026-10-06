import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useEmergency } from '@/contexts/EmergencyContext';
import ResponderNavigation from '@/components/ResponderNavigation';
import { Card, EmptyState, PageHeader, Screen, Section, StatusBadge, TypeBadge } from '@/components/ui';
import { colors, space, type } from '@/theme/tokens';

export default function ResponderMap() {
  const { user } = useAuth();
  const { reports } = useEmergency();
  const incidents = useMemo(() => reports.filter(report => report.assigned_team_id === user?.teamId && (report.status === 'dispatched' || report.status === 'responding')), [reports, user?.teamId]);
  return <Screen><PageHeader eyebrow="Response navigation" title="Incident map" description="Routes run from your live position to the incident by road. Distance and estimated arrival come from road routing only; nothing is guessed when routing is unavailable." />
    <Section title="Assigned locations">{incidents.length === 0 ? <EmptyState title="No locations to show" message="Active assigned incidents with coordinates appear here." /> : <View style={styles.stack}>{incidents.map(report => <Card key={report.id}>
      <View style={styles.head}><TypeBadge value={report.type} /><StatusBadge value={report.status} /></View>
      <Text style={styles.location}>{report.location}</Text>
      <ResponderNavigation reportId={report.id} />
    </Card>)}</View>}</Section>
  </Screen>;
}
const styles = StyleSheet.create({ stack: { gap: space.lg }, head: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, location: { ...type.heading, color: colors.ink, marginVertical: space.lg } });
