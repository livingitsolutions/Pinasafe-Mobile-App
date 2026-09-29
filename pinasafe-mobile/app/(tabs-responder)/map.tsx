import React, { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { MapPin, Navigation } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useEmergency } from '@/contexts/EmergencyContext';
import { Banner, Button, Card, EmptyState, PageHeader, Screen, Section, StatusBadge, TypeBadge } from '@/components/ui';
import { colors, space, type } from '@/theme/tokens';
import { hasAuthoritativeCoordinates } from '@/utils/operations';

export default function ResponderMap() {
  const { user } = useAuth();
  const { reports } = useEmergency();
  const incidents = useMemo(() => reports.filter(report => report.assigned_team_id === user?.teamId && (report.status === 'dispatched' || report.status === 'responding')), [reports, user?.teamId]);
  return <Screen><PageHeader eyebrow="Authoritative locations" title="Incident map" description="Only coordinates submitted with an assigned incident are used. No fallback location, distance, or ETA is generated." />
    <Section title="Assigned locations">{incidents.length === 0 ? <EmptyState title="No locations to show" message="Active assigned incidents with coordinates appear here." /> : <View style={styles.stack}>{incidents.map(report => <Card key={report.id}><View style={styles.head}><TypeBadge value={report.type} /><StatusBadge value={report.status} /></View><Text style={styles.location}>{report.location}</Text>{hasAuthoritativeCoordinates(report.coordinates) ? <><View style={styles.coordinates}><MapPin size={18} color={colors.success} /><Text style={styles.coordinateText}>Coordinates available</Text></View><Button label="Open in maps" icon={<Navigation size={18} color={colors.white} />} onPress={() => { const coordinates = report.coordinates; if (hasAuthoritativeCoordinates(coordinates)) Linking.openURL(`https://www.openstreetmap.org/?mlat=${coordinates.latitude}&mlon=${coordinates.longitude}#map=17/${coordinates.latitude}/${coordinates.longitude}`); }} /></> : <Banner title="Coordinates unavailable" message="Use the written location and incident details. PinaSafe does not substitute a default map point." tone="warning" />}</Card>)}</View>}</Section>
  </Screen>;
}
const styles = StyleSheet.create({ stack: { gap: space.lg }, head: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, location: { ...type.heading, color: colors.ink, marginVertical: space.lg }, coordinates: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg }, coordinateText: { ...type.label, color: colors.success } });
