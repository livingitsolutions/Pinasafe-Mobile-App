import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MapPin, Radio } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useEmergency } from '@/contexts/EmergencyContext';
import { apiService, isApiError } from '@/services/apiService';
import { Banner, Button, Card, EmptyState, ErrorState, PageHeader, Priority, Screen, Section, StatusBadge, TypeBadge } from '@/components/ui';
import ResponderAssignmentAlert from '@/components/ResponderAssignmentAlert';
import { getEligibleAssignmentAlerts } from '@/utils/responderAssignmentAlert';
import { colors, space, type } from '@/theme/tokens';

export default function ResponderDispatch() {
  const { user } = useAuth();
  const { reports, refreshReports } = useEmergency();
  const [updating, setUpdating] = useState('');
  const [error, setError] = useState('');
  const [confirmedResponseIds, setConfirmedResponseIds] = useState<string[]>([]);
  const assigned = useMemo(() => reports.filter(report => report.assigned_team_id === user?.teamId && report.status !== 'resolved').sort((a, b) => a.status === 'responding' ? -1 : b.status === 'responding' ? 1 : 0), [reports, user?.teamId]);
  const assignmentAlerts = useMemo(() => getEligibleAssignmentAlerts(reports, user).filter(report => !confirmedResponseIds.includes(report.id)), [reports, user, confirmedResponseIds]);
  const refresh = useCallback(async () => { setError(''); try { await refreshReports(); } catch { setError('Assignments could not be refreshed.'); } }, [refreshReports]);
  const advance = async (report: (typeof reports)[number]) => {
    const target = report.status === 'dispatched' ? 'responding' : report.status === 'responding' ? 'resolved' : null;
    if (!target || updating) return;
    setUpdating(report.id); setError('');
    try {
      const response = await apiService.updateResponderLifecycleStatus(report.id, target);
      if (target === 'responding' && response?.data?.data?.status === 'responding') setConfirmedResponseIds(ids => [...ids, report.id]);
      await refreshReports();
    }
    catch (cause) { if (isApiError(cause) && cause.status === 409) { setError('Incident state changed. The latest assignments were loaded.'); await refreshReports(); } else if (isApiError(cause) && cause.status === 403) setError('You are no longer authorized for this assignment.'); else setError('The lifecycle action could not be completed.'); }
    finally { setUpdating(''); }
  };
  const respondFromAlert = (reportId: string) => { const report = assignmentAlerts.find(item => item.id === reportId); if (report) void advance(report); };
  return <Screen>
    <PageHeader eyebrow="Field operations" title="Assignments" description="Your team’s active incidents and next authorized lifecycle action." action={<Button variant="secondary" label="Refresh" onPress={refresh} />} />
    <ResponderAssignmentAlert reports={assignmentAlerts} respondingId={updating} onRespond={respondFromAlert} onView={id => router.push(`/incident/${id}`)} />
    {error ? <ErrorState message={error} onRetry={refresh} /> : null}
    {!user?.teamId ? <Banner title="No team assignment" message="An administrator must add your responder account to an active response team." tone="warning" /> : null}
    <Section title="Current response" description="Important incident information stays above secondary details.">
      {assigned.length === 0 ? <EmptyState title="No active assignment" message="Dispatched incidents assigned to your team appear here." /> : <View style={styles.stack}>{assigned.map(report => <Card key={report.id} tone={report.priority === 'critical' ? 'critical' : 'default'}><View style={styles.head}><View style={styles.badges}><TypeBadge value={report.type} /><StatusBadge value={report.status} /><Priority value={report.priority} /></View><Radio size={22} color={report.status === 'responding' ? colors.brand : colors.info} /></View><Text style={styles.description}>{report.description}</Text><View style={styles.location}><MapPin size={18} color={colors.brand} /><Text style={styles.locationText}>{report.location}</Text></View><View style={styles.actions}><Button variant="secondary" label="Open details" onPress={() => router.push(`/incident/${report.id}`)} />{report.status === 'dispatched' ? <Button label="Respond" loading={updating === report.id} onPress={() => advance(report)} /> : report.status === 'responding' ? <Button label="Mark resolved" loading={updating === report.id} onPress={() => advance(report)} /> : null}</View></Card>)}</View>}
    </Section>
  </Screen>;
}

const styles = StyleSheet.create({ stack: { gap: space.lg }, head: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md }, badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, description: { ...type.heading, color: colors.ink, marginTop: space.lg }, location: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginVertical: space.lg }, locationText: { ...type.body, color: colors.ink, flex: 1 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'flex-end' } });
