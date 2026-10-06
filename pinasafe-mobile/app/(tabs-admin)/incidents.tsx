import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/apiService';
import { Button, Banner, Card, EmptyState, LoadingState, PageHeader, Screen, Section } from '@/components/ui';
import { OperationalIncidentCard } from '@/components/OperationalIncident';
import { colors, radius, space, type } from '@/theme/tokens';
import type { OperationalCluster } from '@/types/operationalCluster';
import { OPERATIONAL_FILTERS, OperationalFilter, filterOperationalClusters, getNavigationTargetId } from '@/utils/operationalCluster';
import {
  isOperationalHighAlertAudioSupported,
  OperationalHighAlertAudioController,
  getActiveOperationalAlertIds,
} from '@/utils/operationalHighAlert';
import { OperationalQueueCoordinator } from '@/utils/operationalQueueCoordinator';

const REFRESH_INTERVAL_MS = 10000;

export default function AdminIncidents() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<OperationalFilter>('all');
  const [clusters, setClusters] = useState<OperationalCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acknowledgingIds, setAcknowledgingIds] = useState<Set<string>>(() => new Set());
  const [acknowledgementErrors, setAcknowledgementErrors] = useState<Record<string, string>>({});
  const [soundState, setSoundState] = useState<'disabled' | 'enabling' | 'enabled' | 'unavailable'>('disabled');
  const [soundError, setSoundError] = useState('');
  const queueCoordinatorRef = useRef<OperationalQueueCoordinator | null>(null);
  const audioSupported = isOperationalHighAlertAudioSupported(Platform.OS);
  const audioControllerRef = useRef<OperationalHighAlertAudioController | null>(null);
  if (!audioControllerRef.current) {
    audioControllerRef.current = new OperationalHighAlertAudioController(Platform.OS, () => {
      setSoundState('unavailable');
      setSoundError('Alert sound playback is unavailable. The visual alert remains active.');
    });
  }
  const visible = useMemo(() => filterOperationalClusters(clusters, filter), [clusters, filter]);
  const activeAlertIds = useMemo(() => getActiveOperationalAlertIds(clusters), [clusters]);

  const load = useCallback(async () => {
    await queueCoordinatorRef.current?.load();
  }, []);

  useEffect(() => {
    const coordinator = new OperationalQueueCoordinator(apiService, {
      setClusters,
      setLoading,
      setError,
      setAcknowledgingIds,
      setAcknowledgementErrors,
    });
    coordinator.activate();
    queueCoordinatorRef.current = coordinator;
    void coordinator.load();
    const interval = setInterval(() => { void coordinator.load(); }, REFRESH_INTERVAL_MS);
    return () => {
      coordinator.dispose();
      if (queueCoordinatorRef.current === coordinator) queueCoordinatorRef.current = null;
      clearInterval(interval);
      audioControllerRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    audioControllerRef.current?.syncOperationalAlerts(activeAlertIds);
  }, [activeAlertIds]);

  const acknowledge = useCallback((operationalId: string) => (
    queueCoordinatorRef.current?.acknowledge(operationalId)
  ), []);

  const enableAlertSound = useCallback(async () => {
    if (!audioSupported) {
      setSoundState('unavailable');
      setSoundError('Operational alert sound is unavailable on this platform. Visual alerts remain available.');
      return;
    }
    setSoundState('enabling');
    setSoundError('');
    try {
      await audioControllerRef.current?.enable();
      setSoundState('enabled');
    } catch {
      setSoundState('unavailable');
      setSoundError('Alert sound could not be enabled. Visual alerts and acknowledgement remain available.');
    }
  }, [audioSupported]);

  const open = (cluster: OperationalCluster) => {
    const targetId = getNavigationTargetId(cluster, user?.organizationId);
    if (targetId) router.push(`/incident/${targetId}`);
  };

  return <Screen>
    <PageHeader eyebrow="Operations queue" title="Incidents" description="Priority indicates urgency; corroboration indicates independent confirmation. Each incident remains actionable regardless of corroboration." action={<Button variant="secondary" label="Refresh" onPress={load} />} />
    <View style={styles.soundControl}>
      <Text style={styles.soundCopy}>{audioSupported
        ? 'High Alert sound is optional. Enable it with this interaction; visual alerts remain available without sound.'
        : 'Operational High Alert sound is unavailable on this platform. Visual alerts remain available.'}</Text>
      <Button
        variant="secondary"
        label={!audioSupported ? 'Alert sound unavailable on this platform' : soundState === 'enabled' ? 'Alert sound enabled' : soundState === 'unavailable' ? 'Retry alert sound' : 'Enable alert sound'}
        onPress={() => { void enableAlertSound(); }}
        disabled={!audioSupported || soundState === 'enabled'}
        loading={soundState === 'enabling'}
      />
    </View>
    {soundError ? <Banner title="Alert sound unavailable" message={soundError} tone="error" /> : null}
    <View accessibilityRole="tablist" style={styles.filters}>{OPERATIONAL_FILTERS.map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value}</Text></Pressable>)}</View>
    {error ? <Banner title="Queue unavailable" message={error} tone="error" action={<Button variant="secondary" label="Retry" onPress={load} />} /> : null}
    <Section title={`${visible.length} ${visible.length === 1 ? 'incident' : 'incidents'}`}>
      {loading ? <LoadingState rows={3} /> : visible.length === 0 ? <EmptyState title="No incidents in this view" message="Choose another lifecycle filter or refresh the queue." /> : <Card>{visible.map(cluster => <OperationalIncidentCard
        key={cluster.operationalId}
        cluster={cluster}
        isAdmin={user?.role === 'admin'}
        acknowledging={acknowledgingIds.has(cluster.operationalId)}
        acknowledgementError={acknowledgementErrors[cluster.operationalId]}
        onAcknowledge={() => { void acknowledge(cluster.operationalId); }}
        onOpen={() => open(cluster)}
        onOpenMap={url => { void Linking.openURL(url); }}
      />)}</Card>}
    </Section>
  </Screen>;
}

const styles = StyleSheet.create({ soundControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }, soundCopy: { ...type.body, color: colors.ink, flex: 1 }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, filter: { paddingHorizontal: space.md, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, filterActive: { backgroundColor: colors.ink, borderColor: colors.ink }, filterText: { ...type.label, color: colors.muted, textTransform: 'capitalize' }, filterTextActive: { color: colors.white } });
