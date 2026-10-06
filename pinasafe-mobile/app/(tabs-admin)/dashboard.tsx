import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle, ArrowRight, Radio, UsersRound } from 'lucide-react-native';
import { useEmergency } from '@/contexts/EmergencyContext';
import { Button, Card, EmptyState, ErrorState, ListRow, MetricCard, PageHeader, Priority, ResponsiveGrid, Screen, Section, StatusBadge, TypeBadge } from '@/components/ui';
import { colors, space, type } from '@/theme/tokens';

export default function AdminDashboard() {
  const { width } = useWindowDimensions();
  const compact = width < 1040;
  const { reports, refreshReports } = useEmergency();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const attention = useMemo(() => reports.filter(item => item.status !== 'resolved').sort((a, b) => (a.status === 'pending' ? -1 : b.status === 'pending' ? 1 : 0)), [reports]);
  const counts = useMemo(() => ({ pending: reports.filter(r => r.status === 'pending').length, dispatched: reports.filter(r => r.status === 'dispatched').length, responding: reports.filter(r => r.status === 'responding').length, resolved: reports.filter(r => r.status === 'resolved').length }), [reports]);
  const refresh = useCallback(async () => { setRefreshing(true); setError(''); try { await refreshReports(); } catch { setError('Command data could not be refreshed.'); } finally { setRefreshing(false); } }, [refreshReports]);

  return <Screen>
    <PageHeader eyebrow="Operations" title="Command center" description="Review active incidents and coordinate your response teams." action={<Button variant="secondary" label="Refresh" onPress={refresh} loading={refreshing} />} />
    {error ? <ErrorState message={error} onRetry={refresh} /> : null}
    <ResponsiveGrid><MetricCard label="Awaiting dispatch" value={counts.pending} tone={counts.pending ? 'critical' : 'default'} hint="Needs an eligible team" /><MetricCard label="Dispatched" value={counts.dispatched} tone={counts.dispatched ? 'warning' : 'default'} hint="Awaiting responder" /><MetricCard label="Teams responding" value={counts.responding} hint="Active field response" /><MetricCard label="Resolved" value={counts.resolved} tone="success" hint="All recorded incidents" /></ResponsiveGrid>
    <View style={[styles.board, compact && styles.boardCompact]}>
      <View style={styles.main}>
      <Section title="Needs attention" description="Pending incidents appear first." action={<Button variant="quiet" label="Open full queue" onPress={() => router.push('/(tabs-admin)/incidents')} icon={<ArrowRight size={17} color={colors.ink} />} />}>
        {attention.length === 0 ? <EmptyState title="Queue is clear" message="There are no unresolved incidents in your organization." /> : <Card>{attention.slice(0, 7).map(report => <ListRow key={report.id} onPress={() => router.push(`/incident/${report.id}`)} leading={<TypeBadge value={report.type} />} title={report.location} subtitle={report.description} trailing={<View style={styles.trailing}><StatusBadge value={report.status} /><Priority value={report.priority} /></View>} />)}</Card>}
      </Section>
      </View>
      <View style={[styles.rail, compact && styles.railCompact]}><Card><Radio size={22} color={colors.brand} /><Text style={styles.railTitle}>Response steps</Text><Text style={styles.railText}>Assign a response team to a pending report. The assigned responders press Respond, then mark the response resolved when complete.</Text></Card><Card><UsersRound size={22} color={colors.info} /><Text style={styles.railTitle}>Dispatch readiness</Text><Text style={styles.railText}>A team must be active and include an eligible, active responder before it can be assigned.</Text></Card><Card><AlertTriangle size={22} color={colors.warning} /><Text style={styles.railTitle}>Keep information current</Text><Text style={styles.railText}>If an incident changes while you act, review its latest status before trying again.</Text></Card></View>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({ main: { flex: 1, minWidth: 0 }, boardCompact: { flexDirection: 'column' }, railCompact: { maxWidth: '100%' }, board: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: space.xl }, rail: { width: '100%', maxWidth: 320, gap: space.md }, railTitle: { ...type.heading, color: colors.ink, marginTop: space.md }, railText: { ...type.body, color: colors.muted, marginTop: space.xs }, trailing: { alignItems: 'flex-end', gap: space.sm } });
