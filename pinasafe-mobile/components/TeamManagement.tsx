import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import teamService, { RescueTeam } from '@/services/teamService';
import personnelService, { Personnel } from '@/services/personnelService';
import { Banner, Button, Card, Dialog, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader, Screen, StatusBadge, TextArea } from '@/components/ui';
import { colors, radius, space, type } from '@/theme/tokens';
import { isTeamPresentationReady } from '@/utils/operations';

export default function TeamManagement() {
  const [teams, setTeams] = useState<RescueTeam[]>([]);
  const [members, setMembers] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', teamLeaderId: '', selected: [] as string[] });
  const load = useCallback(async () => { setLoading(true); setError(''); try { const [teamData, memberData] = await Promise.all([teamService.getAllTeams(), personnelService.getRescueMembers()]); setTeams(teamData); setMembers(memberData.filter(item => item.is_active)); } catch { setError('Teams could not be loaded.'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const selectLeader = useCallback((userId: string) => {
    setForm(value => {
      const isSame = value.teamLeaderId === userId;
      if (isSame) {
        const nextSelected = value.selected.filter(id => id !== userId);
        return { ...value, teamLeaderId: '', selected: nextSelected };
      }
      const nextSelected = value.selected.includes(userId) ? value.selected : [...value.selected, userId];
      return { ...value, teamLeaderId: userId, selected: nextSelected };
    });
  }, []);
  const toggleMember = useCallback((userId: string) => {
    setForm(value => {
      const selected = value.selected.includes(userId);
      const nextSelected = selected ? value.selected.filter(item => item !== userId) : [...value.selected, userId];
      const nextLeader = selected && value.teamLeaderId === userId ? '' : value.teamLeaderId;
      return { ...value, teamLeaderId: nextLeader, selected: nextSelected };
    });
  }, []);
  const canCreate = form.name.trim().length > 0 && form.teamLeaderId.length > 0;
  const create = async () => {
    if (!form.name.trim() || !form.teamLeaderId) return;
    setSaving(true); setError('');
    try {
      const team = await teamService.createTeam({ name: form.name, description: form.description || undefined, teamLeaderId: form.teamLeaderId });
      const memberResults = await Promise.allSettled(form.selected.map(userId => teamService.addTeamMember(team.id, { userId })));
      const failures = memberResults.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        setOpen(false);
        setForm({ name: '', description: '', teamLeaderId: '', selected: [] });
        const failedCount = failures.length;
        const totalCount = form.selected.length;
        if (failedCount === totalCount) {
          setError(`The team was created but none of the ${totalCount} member${totalCount === 1 ? '' : 's'} could be assigned. Add members from the team list or delete the team and try again.`);
        } else {
          setError(`${failedCount} of ${totalCount} member${failedCount === 1 ? '' : 's'} could not be assigned. The team was created with the remaining members. Add the missing members from the team list.`);
        }
      } else {
        setOpen(false);
        setForm({ name: '', description: '', teamLeaderId: '', selected: [] });
      }
      await load();
    }
    catch { setError('The team could not be created. Check leader and member eligibility.'); }
    finally { setSaving(false); }
  };

  return <Screen>
    <PageHeader eyebrow="Organization" title="Response teams" description="Build active teams with eligible rescue responders before dispatch." action={<Button label="Create team" onPress={() => setOpen(true)} />} />
    {error ? <ErrorState message={error} onRetry={load} /> : null}
    {loading ? <LoadingState rows={3} /> : teams.length === 0 ? <EmptyState title="No active teams" message="Create a team, choose a leader, and add active rescue responders." action={<Button label="Create first team" onPress={() => setOpen(true)} />} /> : <View style={styles.grid}>{teams.map(team => { const ready = isTeamPresentationReady(team); return <Card key={team.id} style={styles.team}><View style={styles.head}><View style={{ flex: 1 }}><Text style={styles.name}>{team.name}</Text><Text style={styles.description}>{team.description || 'No team description'}</Text></View><StatusBadge value={ready ? 'active' : 'inactive'} /></View><View style={styles.readiness}><Text style={styles.readinessLabel}>{ready ? 'Assignment ready' : 'Not assignment ready'}</Text><Text style={styles.meta}>{team.members.length} {team.members.length === 1 ? 'member' : 'members'} · {team.team_leader?.name ? `Led by ${team.team_leader.name}` : 'No leader selected'}</Text></View>{!ready ? <Banner title="Cannot respond yet" message="Add at least one eligible active rescue responder." tone="warning" /> : null}</Card>; })}</View>}
    <Dialog visible={open} title="Create response team" onClose={() => setOpen(false)} footer={<View style={styles.actions}><Button variant="secondary" label="Cancel" onPress={() => setOpen(false)} /><Button label="Create team" onPress={create} loading={saving} disabled={!canCreate} /></View>}>
      <View style={styles.form}><Field label="Team name"><Input value={form.name} onChangeText={name => setForm(value => ({ ...value, name }))} /></Field><Field label="Description"><TextArea value={form.description} onChangeText={description => setForm(value => ({ ...value, description }))} /></Field><Field label="Team leader" hint="Leader must be an active rescue responder. Selecting a leader also adds them as a member."><View style={styles.options}>{members.map(member => { const id = member.user_id || ''; const isLeader = form.teamLeaderId === id; return <Pressable key={member.id} disabled={!id} onPress={() => selectLeader(id)} style={[styles.option, isLeader && styles.optionSelected]}><Text style={styles.optionName}>{member.name}{isLeader ? ' — Leader' : ''}</Text></Pressable>; })}</View></Field><Field label="Members" hint="The leader is included automatically. Add more active rescue responders as needed."><View style={styles.options}>{members.map(member => { const id = member.user_id || ''; const selected = form.selected.includes(id); const isLeader = form.teamLeaderId === id; return <Pressable key={member.id} disabled={!id} onPress={() => toggleMember(id)} style={[styles.option, selected && styles.optionSelected]}><Text style={styles.optionName}>{member.name}{isLeader ? ' — Leader' : ''}</Text></Pressable>; })}</View></Field></View>
    </Dialog>
  </Screen>;
}

const styles = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg }, team: { flex: 1, minWidth: 280, maxWidth: 540, gap: space.lg }, head: { flexDirection: 'row', gap: space.md }, name: { ...type.heading, color: colors.ink }, description: { ...type.body, color: colors.muted, marginTop: space.xs }, readiness: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md }, readinessLabel: { ...type.label, color: colors.ink }, meta: { ...type.caption, color: colors.muted, marginTop: space.xs }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'flex-end' }, form: { gap: space.lg }, options: { gap: space.sm }, option: { padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }, optionSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft }, optionName: { ...type.label, color: colors.ink } });
