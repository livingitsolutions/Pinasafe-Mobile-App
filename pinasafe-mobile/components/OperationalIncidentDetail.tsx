import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, ShieldAlert } from 'lucide-react-native';
import { apiService, isApiError } from '@/services/apiService';
import teamService, { RescueTeam } from '@/services/teamService';
import { acquireDispatchLock } from '@/utils/adminDispatch';
import { isTeamPresentationReady } from '@/utils/operations';
import { Banner, Button, Dialog, EmptyState, ErrorState, IconButton, LoadingState, PageHeader, Screen, Section } from '@/components/ui';
import { MemberEvidenceState, OperationalIncidentHeader, OperationalMemberSection } from '@/components/OperationalIncident';
import { colors, radius, space, type } from '@/theme/tokens';
import type { OperationalCluster } from '@/types/operationalCluster';
import {
  SingleReportSource,
  buildSingleReportOperational,
  canDispatchMember,
  findOperationalClusterForReport,
  getScopedMembers,
} from '@/utils/operationalCluster';

export default function OperationalIncidentDetail({ report, role, routeId = report.id }: {
  report: SingleReportSource;
  role?: string | null;
  routeId?: string;
}) {
  const [cluster, setCluster] = useState<OperationalCluster | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');
  const [evidence, setEvidence] = useState<Record<string, MemberEvidenceState>>({});
  const [teams, setTeams] = useState<RescueTeam[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState('');
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);
  const currentRouteIdRef = useRef(routeId);
  const loadRef = useRef<() => Promise<void>>(async () => {});
  currentRouteIdRef.current = routeId;

  const loadEvidence = useCallback(async (reportIds: string[], requestId: number) => {
    if (!mountedRef.current || requestId !== requestIdRef.current) return;
    setEvidence(Object.fromEntries(reportIds.map(id => [id, { status: 'loading' } as MemberEvidenceState])));
    await Promise.all(reportIds.map(async id => {
      let next: MemberEvidenceState;
      try {
        const response = await apiService.getReportEvidence(id);
        next = { status: 'ready', items: response.data?.data || [] };
      } catch (cause) {
        next = { status: 'error', message: isApiError(cause) && cause.status === 403 ? 'Evidence is restricted for this report.' : 'Evidence could not be loaded. Try refreshing the signed link.' };
      }
      if (mountedRef.current && requestId === requestIdRef.current) {
        setEvidence(current => ({ ...current, [id]: next }));
      }
    }));
  }, []);

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    const requestId = ++requestIdRef.current;
    setLoading(true); setSummaryError('');
    let resolved: OperationalCluster | null = null;
    try {
      const response = await apiService.getOperationalClusters();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      const clusters = Array.isArray(response.data?.data) ? response.data.data : [];
      resolved = findOperationalClusterForReport(clusters, report.id);
      if (!resolved) setSummaryError('The operational summary does not include this report. Showing this report only.');
    } catch {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setSummaryError('The operational summary could not be loaded. Showing this report only.');
    }
    if (!mountedRef.current || requestId !== requestIdRef.current) return;
    const next = resolved ?? buildSingleReportOperational(report);
    setCluster(next);
    setLoading(false);
    await loadEvidence(next.memberReports.map(member => member.id), requestId);
  }, [report, loadEvidence]);
  loadRef.current = load;

  useEffect(() => {
    mountedRef.current = true;
    const requestIdRefCurrent = requestIdRef;
    return () => {
      mountedRef.current = false;
      requestIdRefCurrent.current++;
    };
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadTeams = useCallback(async () => {
    setLoadingTeams(true); setMessage('');
    try { setTeams(await teamService.getTeams()); } catch { setMessage('Teams could not be loaded.'); setTeams([]); } finally { setLoadingTeams(false); }
  }, []);

  const openDispatch = (reportId: string) => { setSelectedReportId(reportId); setTeamId(''); setMessage(''); void loadTeams(); };

  const dispatch = async () => {
    if (!selectedReportId || !teamId || !acquireDispatchLock(lock)) return;
    const initiatingRouteId = routeId;
    setDispatching(true); setMessage('');
    try {
      await apiService.assignTeamToReport(selectedReportId, teamId);
      if (!mountedRef.current || currentRouteIdRef.current !== initiatingRouteId) return;
      setSelectedReportId(null);
      await loadRef.current();
    }
    catch (cause) {
      if (!mountedRef.current || currentRouteIdRef.current !== initiatingRouteId) return;
      if (isApiError(cause) && cause.status === 409) { setMessage('Incident or team readiness changed. The incident was refreshed; review before trying again.'); await loadRef.current(); }
      else if (isApiError(cause) && cause.status === 403) setMessage('You are not authorized to dispatch this incident.');
      else setMessage(isApiError(cause) ? cause.message : 'Dispatch failed.');
    } finally {
      lock.current = false;
      if (mountedRef.current && currentRouteIdRef.current === initiatingRouteId) setDispatching(false);
    }
  };

  const members = useMemo(() => (cluster ? getScopedMembers(cluster) : []), [cluster]);
  const openMap = (url: string) => { void Linking.openURL(url); };

  if (loading && !cluster) return <Screen><PageHeader eyebrow="Operational incident" title="Loading incident" /><LoadingState rows={4} /></Screen>;
  if (!cluster) return <Screen><EmptyState title="Incident not found" message="This incident is unavailable or outside your access." /></Screen>;

  return <Screen>
    <PageHeader eyebrow="Operational incident" title={cluster.type === 'fire' ? 'Fire incident' : cluster.type === 'road' ? 'Road incident' : 'Incident'} description={`Reference ${(cluster.clusterId ?? cluster.operationalId).slice(0, 8).toUpperCase()}`} action={<IconButton label="Go back" onPress={router.back}><ArrowLeft size={20} color={colors.ink} /></IconButton>} />
    {summaryError ? <Banner title="Operational summary" message={summaryError} tone="warning" action={<Button variant="secondary" label="Retry" onPress={load} />} /> : null}
    <OperationalIncidentHeader cluster={cluster} onOpenMap={openMap} />
    <Section title="Reports" description="Each report remains independent. Dispatch applies to a single report only.">
      {members.length === 0 ? <ErrorState message="No reports are available for this incident." onRetry={load} /> : members.map((member, index) => <OperationalMemberSection
        key={member.id}
        member={member}
        index={index}
        evidence={evidence[member.id]}
        canDispatch={canDispatchMember(member, role)}
        onDispatch={() => openDispatch(member.id)}
        onOpenReport={member.id !== report.id ? () => router.push(`/incident/${member.id}`) : undefined}
      />)}
    </Section>
    <Dialog visible={Boolean(selectedReportId)} title="Dispatch this report" onClose={() => setSelectedReportId(null)} footer={<View style={styles.dialogActions}><Button variant="secondary" label="Cancel" onPress={() => setSelectedReportId(null)} /><Button label="Dispatch team" disabled={!teamId} loading={dispatching} onPress={dispatch} /></View>}>
      <Text style={styles.dialogText}>This dispatches only the selected report. Select an active, assignment-ready team. Final eligibility is enforced by the backend.</Text>
      {message ? <Banner title="Dispatch unavailable" message={message} tone="error" /> : null}
      {loadingTeams ? <Text style={styles.dialogText}>Loading teams…</Text> : teams.length === 0 ? <EmptyState title="No active teams" message="Create and staff a response team before dispatching this incident." /> : <View style={styles.teamList}>{teams.map(team => { const ready = isTeamPresentationReady(team); return <Pressable key={team.id} disabled={!ready} onPress={() => setTeamId(team.id)} style={[styles.team, teamId === team.id && styles.teamSelected, !ready && styles.teamDisabled]}><View style={{ flex: 1 }}><Text style={styles.teamName}>{team.name}</Text><Text style={styles.teamMeta}>{ready ? `${team.members?.length || 0} listed members` : 'Not assignment ready'}</Text></View>{teamId === team.id ? <ShieldAlert size={20} color={colors.brand} /> : null}</Pressable>; })}</View>}
    </Dialog>
  </Screen>;
}

const styles = StyleSheet.create({ dialogText: { ...type.body, color: colors.muted, marginBottom: space.lg }, dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.md }, teamList: { gap: space.sm }, team: { minHeight: 66, flexDirection: 'row', alignItems: 'center', padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }, teamSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft }, teamDisabled: { opacity: .5 }, teamName: { ...type.label, color: colors.ink }, teamMeta: { ...type.caption, color: colors.muted, marginTop: 2 } });
