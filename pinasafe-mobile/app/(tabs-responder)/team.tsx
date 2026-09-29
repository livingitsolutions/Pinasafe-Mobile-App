import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/apiService';
import { Card, EmptyState, ErrorState, ListRow, LoadingState, PageHeader, Screen, StatusBadge } from '@/components/ui';
import { colors, space, type } from '@/theme/tokens';

type Team = { id: string; name: string; description?: string; is_active: boolean; team_leader?: { id: string; name: string }; members: { id: string; position?: string; user?: { id: string; name: string; phone?: string } }[] };
export default function ResponderTeam() {
  const { user } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const response = await apiService.getTeams(); const teams = response.data?.data || []; setTeam(teams.find(item => item.id === user?.teamId) || null); } catch { setError('Team context could not be loaded.'); } finally { setLoading(false); } }, [user?.teamId]);
  useEffect(() => { load(); }, [load]);
  return <Screen><PageHeader eyebrow="Field operations" title="Your team" description="Current organization team membership and leadership context." />{error ? <ErrorState message={error} onRetry={load} /> : loading ? <LoadingState rows={3} /> : !team ? <EmptyState title="No response team" message="Your responder account is not currently assigned to an active team." /> : <><Card><View style={styles.head}><View style={{ flex: 1 }}><Text style={styles.name}>{team.name}</Text><Text style={styles.description}>{team.description || 'Active response team'}</Text></View><StatusBadge value={team.is_active ? 'active' : 'inactive'} /></View><Text style={styles.meta}>{team.team_leader?.name ? `Team leader: ${team.team_leader.name}` : 'No team leader selected'}</Text></Card><Card>{team.members.length === 0 ? <EmptyState title="No listed members" message="This team is not assignment ready." /> : team.members.map(member => <ListRow key={member.id} title={member.user?.name || 'Responder'} subtitle={member.position || 'Team member'} trailing={member.user?.id === user?.id ? <Text style={styles.you}>You</Text> : undefined} />)}</Card></>}</Screen>;
}
const styles = StyleSheet.create({ head: { flexDirection: 'row', gap: space.md }, name: { ...type.title, color: colors.ink }, description: { ...type.body, color: colors.muted, marginTop: space.xs }, meta: { ...type.label, color: colors.ink, marginTop: space.lg }, you: { ...type.label, color: colors.brand } });
