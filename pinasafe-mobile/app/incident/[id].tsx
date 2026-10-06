import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, MapPin, RefreshCw, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { apiService, isApiError, PrivateEvidenceItem } from '@/services/apiService';
import { ActionBar, Banner, Button, Card, DetailItem, EmptyState, ErrorState, IconButton, LoadingState, PageHeader, Priority, Screen, Section, StatusBadge, TypeBadge } from '@/components/ui';
import OperationalIncidentDetail from '@/components/OperationalIncidentDetail';
import CitizenResponseTracking from '@/components/CitizenResponseTracking';
import ResponderNavigation from '@/components/ResponderNavigation';
import { getEmergencyReportMapUrl } from '@/utils/mapUrl';
import { navigateBackFromIncident } from '@/utils/incidentNavigation';
import { colors, radius, space, type } from '@/theme/tokens';

type Report = {
  id: string; type: string; description: string; location: string; priority: string; status: 'pending' | 'dispatched' | 'responding' | 'resolved';
  created_at?: string; updated_at?: string; resolved_at?: string; assigned_team?: { id: string; name: string }; assigned_team_id?: string;
  coordinates: { latitude: number; longitude: number } | null; organization_id?: string; reporter_name?: string; reporter_phone?: string;
};

export { getEmergencyReportMapUrl };

export default function IncidentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [report, setReport] = useState<Report | null>(null);
  const [evidence, setEvidence] = useState<PrivateEvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [evidenceError, setEvidenceError] = useState('');
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    if (!mountedRef.current) return;
    const requestId = ++requestIdRef.current;
    setLoading(true); setError(''); setEvidenceError('');
    try {
      const [reportResponse, evidenceResponse] = await Promise.allSettled([apiService.getEmergencyReport(id), isAdmin ? Promise.resolve(null) : apiService.getReportEvidence(id)]);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      if (reportResponse.status === 'rejected') throw reportResponse.reason;
      setReport(reportResponse.value.data?.data || null);
      if (evidenceResponse.status === 'fulfilled') setEvidence(evidenceResponse.value?.data?.data || []);
      else setEvidenceError(isApiError(evidenceResponse.reason) && evidenceResponse.reason.status === 403 ? 'Evidence is restricted for this assignment.' : 'Evidence could not be loaded. Try refreshing the signed link.');
    } catch (cause) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(isApiError(cause) && cause.status === 403 ? 'You no longer have access to this incident.' : 'The incident could not be loaded.');
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false);
    }
  }, [id, isAdmin]);

  useEffect(() => {
    mountedRef.current = true;
    const requestIdRefCurrent = requestIdRef;
    return () => {
      mountedRef.current = false;
      requestIdRefCurrent.current++;
    };
  }, []);
  useEffect(() => { load(); }, [load]);
  const nextStatus = useMemo(() => report?.status === 'dispatched' ? 'responding' : report?.status === 'responding' ? 'resolved' : null, [report?.status]);
  const mapUrl = report ? getEmergencyReportMapUrl(report.coordinates) : null;

  const advance = async () => {
    if (!report || !nextStatus || actionLoading) return;
    setActionLoading(true);
    try {
      await apiService.updateResponderLifecycleStatus(report.id, nextStatus);
      await load();
    } catch (cause) {
      if (isApiError(cause) && cause.status === 409) { setError('Incident state changed. The latest state has been loaded.'); await load(); }
      else if (isApiError(cause) && cause.status === 403) setError('Your team is not authorized for this action.');
      else setError('We couldn’t update the response. Check your connection and try again.');
    } finally { setActionLoading(false); }
  };

  const backAction = <IconButton label="Go back" onPress={() => { navigateBackFromIncident(router, user?.role); }}><ArrowLeft size={20} color={colors.ink} /></IconButton>;

  if (loading) return <Screen><PageHeader eyebrow="Incident record" title="Loading incident" navigation={backAction} /><LoadingState rows={4} label="Loading incident details…" /></Screen>;
  if (error && !report) return <Screen><PageHeader title="Incident unavailable" navigation={backAction} /><ErrorState message={error} onRetry={load} /></Screen>;
  if (report && isAdmin) return <OperationalIncidentDetail report={report} role={user?.role} routeId={id} />;
  if (!report) return <Screen><PageHeader eyebrow="Incident record" title="Incident not found" navigation={backAction} /><EmptyState title="Incident not found" message="This incident is unavailable or outside your access." /></Screen>;

  return <Screen>
    <PageHeader eyebrow="Incident detail" title={report.type === 'fire' ? 'Fire incident' : 'Road incident'} description={`Reference ${report.id.slice(0, 8).toUpperCase()}`} navigation={backAction} />
    {error ? <Banner title="Action needs attention" message={error} tone="warning" /> : null}
    <Card tone={report.priority === 'critical' ? 'critical' : 'default'}>
      <View style={styles.badges}><TypeBadge value={report.type} /><StatusBadge value={report.status} /><Priority value={report.priority} /></View>
      <Text style={styles.description}>{report.description}</Text>
      <View style={styles.location}><MapPin size={20} color={colors.brand} /><Text style={styles.locationText}>{report.location}</Text></View>
      <View style={styles.details}><DetailItem label="Reported" value={report.created_at ? new Date(report.created_at).toLocaleString() : undefined} />{user?.role === 'citizen' ? null : <DetailItem label="Assigned team" value={report.assigned_team?.name} />}<DetailItem label="Last updated" value={report.updated_at ? new Date(report.updated_at).toLocaleString() : undefined} /></View>
      {mapUrl ? <Button variant="secondary" label="Open location in maps" onPress={() => Linking.openURL(mapUrl)} icon={<MapPin size={18} color={colors.ink} />} /> : <Banner title="Map coordinates unavailable" message="Map coordinates are unavailable for this incident." tone="info" />}
    </Card>
    {user?.role === 'responder' && nextStatus === 'responding' ? <ActionBar><Button label="Respond" onPress={advance} loading={actionLoading} /></ActionBar> : null}
    {user?.role === 'citizen' ? <Section title="Response status"><CitizenResponseTracking reportId={report.id} /></Section> : null}
    {user?.role === 'responder' && report.status === 'responding' ? <Section title="Live location and navigation" description="See your route and estimated arrival. Location sharing controls stay on Dispatch.">
      <ResponderNavigation reportId={report.id} />
      <Button variant="secondary" label="Open live location controls" onPress={() => router.push('/(tabs-responder)/dispatch')} />
    </Section> : null}
    <Section title="Evidence" description="Photos are private. Refresh if a photo no longer opens." action={<IconButton label="Refresh evidence" onPress={load}><RefreshCw size={18} color={colors.ink} /></IconButton>}>
      {evidenceError ? <ErrorState message={evidenceError} onRetry={load} /> : evidence.length === 0 ? <EmptyState title="No evidence available" message="No accepted evidence is attached to this report." /> : <View style={styles.evidenceGrid}>{evidence.map(item => <Card key={item.id} style={styles.evidenceCard}><Image accessibilityLabel={`${item.evidenceRole === 'supplementary' ? 'Supplementary' : 'Accepted'} incident evidence`} source={{ uri: item.url }} resizeMode="cover" style={styles.image} /><View style={styles.evidenceMeta}><ShieldCheck size={18} color={colors.success} /><View style={{ flex: 1 }}><Text style={styles.evidenceTitle}>{item.evidenceRole === 'supplementary' ? 'Supplementary evidence' : item.classification ? `Server-verified ${item.classification.label}` : 'Accepted incident evidence'}</Text><Text style={styles.caption}>{item.classification ? (item.classification.confidence == null ? 'Classification accepted' : `${Math.round(item.classification.confidence * 100)}% confidence`) : 'Not classified'} · {item.width}×{item.height}</Text></View></View></Card>)}</View>}
    </Section>
    {user?.role === 'responder' && nextStatus === 'resolved' ? <ActionBar><Button variant="danger" label="Mark resolved" onPress={advance} loading={actionLoading} /></ActionBar> : null}
  </Screen>;
}

const styles = StyleSheet.create({ badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }, description: { ...type.heading, color: colors.ink, marginVertical: space.lg }, location: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }, locationText: { ...type.body, color: colors.ink, flex: 1, minWidth: 0 }, details: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl, marginVertical: space.lg }, evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg }, evidenceCard: { width: '100%', maxWidth: 520, padding: 0, overflow: 'hidden' }, image: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.surfaceAlt }, evidenceMeta: { flexDirection: 'row', gap: space.sm, padding: space.lg }, evidenceTitle: { ...type.label, color: colors.ink }, caption: { ...type.caption, color: colors.muted, marginTop: 2 } });
