import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/apiService';
import { Button, Banner, Card, EmptyState, LoadingState, PageHeader, Screen, Section } from '@/components/ui';
import { OperationalIncidentCard } from '@/components/OperationalIncident';
import { colors, radius, space, type } from '@/theme/tokens';
import type { OperationalCluster } from '@/types/operationalCluster';
import { OPERATIONAL_FILTERS, OperationalFilter, filterOperationalClusters, getNavigationTargetId } from '@/utils/operationalCluster';

const REFRESH_INTERVAL_MS = 10000;

export default function AdminIncidents() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<OperationalFilter>('all');
  const [clusters, setClusters] = useState<OperationalCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);
  const visible = useMemo(() => filterOperationalClusters(clusters, filter), [clusters, filter]);

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const response = await apiService.getOperationalClusters();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setClusters(Array.isArray(response.data?.data) ? response.data.data : []);
      setError('');
    } catch {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError('Operational incidents could not be loaded.');
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const interval = setInterval(() => { void load(); }, REFRESH_INTERVAL_MS);
    const requestIdRefCurrent = requestIdRef;
    return () => {
      mountedRef.current = false;
      requestIdRefCurrent.current++;
      clearInterval(interval);
    };
  }, [load]);

  const open = (cluster: OperationalCluster) => {
    const targetId = getNavigationTargetId(cluster, user?.organizationId);
    if (targetId) router.push(`/incident/${targetId}`);
  };

  return <Screen>
    <PageHeader eyebrow="Operations queue" title="Incidents" description="Each incident groups the independent citizen reports associated with it. Open an incident to review its reports and dispatch." action={<Button variant="secondary" label="Refresh" onPress={load} />} />
    <View accessibilityRole="tablist" style={styles.filters}>{OPERATIONAL_FILTERS.map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value}</Text></Pressable>)}</View>
    {error ? <Banner title="Queue unavailable" message={error} tone="error" action={<Button variant="secondary" label="Retry" onPress={load} />} /> : null}
    <Section title={`${visible.length} ${visible.length === 1 ? 'incident' : 'incidents'}`}>
      {loading ? <LoadingState rows={3} /> : visible.length === 0 ? <EmptyState title="No incidents in this view" message="Choose another lifecycle filter or refresh the queue." /> : <Card>{visible.map(cluster => <OperationalIncidentCard key={cluster.operationalId} cluster={cluster} onOpen={() => open(cluster)} onOpenMap={url => { void Linking.openURL(url); }} />)}</Card>}
    </Section>
  </Screen>;
}

const styles = StyleSheet.create({ filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, filter: { paddingHorizontal: space.md, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, filterActive: { backgroundColor: colors.ink, borderColor: colors.ink }, filterText: { ...type.label, color: colors.muted, textTransform: 'capitalize' }, filterTextActive: { color: colors.white } });
