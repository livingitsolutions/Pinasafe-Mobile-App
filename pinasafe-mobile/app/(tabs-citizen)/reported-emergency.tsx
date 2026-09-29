import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import { useEmergency } from '@/contexts/EmergencyContext';
import { Button, Card, EmptyState, ErrorState, ListRow, PageHeader, Priority, Screen, StatusBadge, TypeBadge } from '@/components/ui';
import { colors, space, type } from '@/theme/tokens';

export default function CitizenReports() {
  const { reports, refreshReports } = useEmergency();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => { setRefreshing(true); setError(''); try { await refreshReports(); } catch { setError('Your incident history could not be refreshed.'); } finally { setRefreshing(false); } }, [refreshReports]);

  return <Screen>
    <PageHeader eyebrow="Your reports" title="Incident history" description="Authoritative status from emergency response teams." action={<Button variant="secondary" label="Refresh" onPress={refresh} loading={refreshing} />} />
    {error ? <ErrorState message={error} onRetry={refresh} /> : null}
    {reports.length === 0 ? <EmptyState title="No reports yet" message="Reports you explicitly submit appear here with their current lifecycle status." /> : <Card>{reports.map(report => <ListRow key={report.id} onPress={() => router.push(`/incident/${report.id}`)} leading={<View style={styles.type}><TypeBadge value={report.type} /></View>} title={report.description} subtitle={report.location} trailing={<View style={styles.trailing}><StatusBadge value={report.status} /><Priority value={report.priority} /></View>} />)}</Card>}
    {reports.length > 0 ? <View style={styles.note}><MapPin size={16} color={colors.muted} /><Text style={styles.noteText}>Map information appears only when coordinates were submitted with the report.</Text></View> : null}
  </Screen>;
}

const styles = StyleSheet.create({ type: { width: 96 }, trailing: { alignItems: 'flex-end', gap: space.sm }, note: { flexDirection: 'row', gap: space.sm, alignItems: 'center' }, noteText: { ...type.caption, color: colors.muted, flex: 1 } });
