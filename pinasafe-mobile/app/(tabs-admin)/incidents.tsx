import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ShieldAlert } from 'lucide-react-native';
import { useEmergency } from '@/contexts/EmergencyContext';
import { apiService, isApiError } from '@/services/apiService';
import teamService, { RescueTeam } from '@/services/teamService';
import { acquireDispatchLock } from '@/utils/adminDispatch';
import { Banner, Button, Card, Dialog, EmptyState, ListRow, PageHeader, Priority, Screen, Section, StatusBadge, TypeBadge } from '@/components/ui';
import { colors, radius, space, type } from '@/theme/tokens';
import { isTeamPresentationReady } from '@/utils/operations';

const filters = ['all', 'pending', 'dispatched', 'responding', 'resolved'] as const;
export default function AdminIncidents() {
  const { reports, refreshReports } = useEmergency();
  const [filter, setFilter] = useState<typeof filters[number]>('all');
  const [teams, setTeams] = useState<RescueTeam[]>([]);
  const [selected, setSelected] = useState<(typeof reports)[number] | null>(null);
  const [teamId, setTeamId] = useState('');
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const visible = useMemo(() => reports.filter(item => filter === 'all' || item.status === filter), [filter, reports]);

  const loadTeams = useCallback(async () => { setLoadingTeams(true); setMessage(''); try { setTeams(await teamService.getTeams()); } catch { setMessage('Teams could not be loaded.'); setTeams([]); } finally { setLoadingTeams(false); } }, []);
  useEffect(() => { loadTeams(); }, [loadTeams]);
  const openDispatch = (incident: (typeof reports)[number]) => { setSelected(incident); setTeamId(''); setMessage(''); void loadTeams(); };
  const dispatch = async () => {
    if (!selected || !teamId || !acquireDispatchLock(lock)) return;
    setDispatching(true); setMessage('');
    try { await apiService.assignTeamToReport(selected.id, teamId); await refreshReports(); setSelected(null); }
    catch (cause) {
      if (isApiError(cause) && cause.status === 409) { setMessage('Incident or team readiness changed. The incident queue was refreshed; review before trying again.'); await refreshReports(); }
      else if (isApiError(cause) && cause.status === 403) setMessage('You are not authorized to dispatch this incident.');
      else setMessage(isApiError(cause) ? cause.message : 'Dispatch failed.');
    } finally { lock.current = false; setDispatching(false); }
  };

  return <Screen>
    <PageHeader eyebrow="Operations queue" title="Incidents" description="Inspect every report, then dispatch pending incidents to an eligible response team." action={<Button variant="secondary" label="Refresh" onPress={refreshReports} />} />
    <View accessibilityRole="tablist" style={styles.filters}>{filters.map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value}</Text></Pressable>)}</View>
    <Section title={`${visible.length} ${visible.length === 1 ? 'incident' : 'incidents'}`}>
      {visible.length === 0 ? <EmptyState title="No incidents in this view" message="Choose another lifecycle filter or refresh the queue." /> : <Card>{visible.map(report => <ListRow key={report.id} onPress={() => router.push(`/incident/${report.id}`)} leading={<TypeBadge value={report.type} />} title={report.location} subtitle={`${report.description} · ${report.reportedAt ? new Date(report.reportedAt).toLocaleString() : 'Time unavailable'}`} trailing={<View style={styles.rowActions}><StatusBadge value={report.status} /><Priority value={report.priority} />{report.status === 'pending' ? <Button label="Dispatch" onPress={() => openDispatch(report)} /> : null}</View>} />)}</Card>}
    </Section>
    <Dialog visible={Boolean(selected)} title="Dispatch incident" onClose={() => setSelected(null)} footer={<View style={styles.dialogActions}><Button variant="secondary" label="Cancel" onPress={() => setSelected(null)} /><Button label="Dispatch team" disabled={!teamId} loading={dispatching} onPress={dispatch} /></View>}>
      <Text style={styles.dialogText}>Select an active, assignment-ready team. Final eligibility is enforced by the backend.</Text>
      {message ? <Banner title="Dispatch unavailable" message={message} tone="error" /> : null}
      {loadingTeams ? <Text style={styles.dialogText}>Loading teams…</Text> : teams.length === 0 ? <EmptyState title="No active teams" message="Create and staff a response team before dispatching this incident." /> : <View style={styles.teamList}>{teams.map(team => { const ready = isTeamPresentationReady(team); return <Pressable key={team.id} disabled={!ready} onPress={() => setTeamId(team.id)} style={[styles.team, teamId === team.id && styles.teamSelected, !ready && styles.teamDisabled]}><View style={{ flex: 1 }}><Text style={styles.teamName}>{team.name}</Text><Text style={styles.teamMeta}>{ready ? `${team.members?.length || 0} listed members` : 'Not assignment ready'}</Text></View>{teamId === team.id ? <ShieldAlert size={20} color={colors.brand} /> : null}</Pressable>; })}</View>}
    </Dialog>
  </Screen>;
}

const styles = StyleSheet.create({ filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, filter: { paddingHorizontal: space.md, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, filterActive: { backgroundColor: colors.ink, borderColor: colors.ink }, filterText: { ...type.label, color: colors.muted, textTransform: 'capitalize' }, filterTextActive: { color: colors.white }, rowActions: { alignItems: 'flex-end', gap: space.sm, maxWidth: 180 }, dialogText: { ...type.body, color: colors.muted, marginBottom: space.lg }, dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.md }, teamList: { gap: space.sm }, team: { minHeight: 66, flexDirection: 'row', alignItems: 'center', padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }, teamSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft }, teamDisabled: { opacity: .5 }, teamName: { ...type.label, color: colors.ink }, teamMeta: { ...type.caption, color: colors.muted, marginTop: 2 } });
