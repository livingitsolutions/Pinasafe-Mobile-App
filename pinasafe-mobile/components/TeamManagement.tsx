import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import teamService, { RescueTeam } from '@/services/teamService';
import personnelService, { Personnel } from '@/services/personnelService';
import { Banner, Button, Card, Dialog, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader, Screen, StatusBadge, TextArea } from '@/components/ui';
import { colors, radius, space, type } from '@/theme/tokens';
import { isTeamPresentationReady } from '@/utils/operations';

const emptyForm = { name: '', description: '', teamLeaderId: '', selected: [] as string[] };

export default function TeamManagement() {
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const [teams, setTeams] = useState<RescueTeam[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [teamData, personnelData] = await Promise.all([
        teamService.getAllTeams(),
        personnelService.getRescueMembers(),
      ]);
      setTeams(teamData);
      setPersonnel(personnelData.filter(item => item.is_active && item.personnel_role === 'rescue_member'));
    } catch {
      setError('Teams and eligible rescue members could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectLeader = useCallback((userId: string) => {
    setForm(value => {
      const isSame = value.teamLeaderId === userId;
      if (isSame) {
        return { ...value, teamLeaderId: '', selected: value.selected.filter(id => id !== userId) };
      }
      const selected = value.selected.includes(userId) ? value.selected : [...value.selected, userId];
      return { ...value, teamLeaderId: userId, selected };
    });
  }, []);

  const toggleMember = useCallback((userId: string) => {
    setForm(value => {
      const isSelected = value.selected.includes(userId);
      const selected = isSelected
        ? value.selected.filter(item => item !== userId)
        : [...value.selected, userId];
      return {
        ...value,
        selected,
        teamLeaderId: isSelected && value.teamLeaderId === userId ? '' : value.teamLeaderId,
      };
    });
  }, []);

  const create = async () => {
    if (!form.name.trim() || !form.teamLeaderId) return;
    setSaving(true);
    setError('');
    try {
      const team = await teamService.createTeam({
        name: form.name.trim(),
        description: form.description || undefined,
        teamLeaderId: form.teamLeaderId,
      });
      const additionalMemberIds = form.selected.filter(userId => userId !== form.teamLeaderId);
      const memberResults = await Promise.allSettled(
        additionalMemberIds.map(userId => teamService.addTeamMember(team.id, { userId })),
      );
      const failedCount = memberResults.filter(result => result.status === 'rejected').length;
      setOpen(false);
      setForm(emptyForm);
      if (failedCount > 0) {
        setError(`${failedCount} selected member${failedCount === 1 ? '' : 's'} could not be assigned. Manage the team to add eligible members.`);
      }
      await load();
    } catch {
      setError('The team could not be created. Check leader and member eligibility.');
    } finally {
      setSaving(false);
    }
  };

  const runTeamAction = async (action: () => Promise<unknown>, successMessage?: string) => {
    setSaving(true);
    setError('');
    try {
      await action();
      if (successMessage) setError(successMessage);
      await load();
    } catch {
      setError('The team could not be updated. Check membership and leader eligibility.');
    } finally {
      setSaving(false);
    }
  };

  const renderTeamDetails = (team: RescueTeam) => {
    const teamMembers = team.members || [];
    const memberUserIds = new Set(teamMembers.map(member => member.user_id));
    const eligibleTeamMembers = teamMembers.filter(member =>
      member.personnel_role === 'rescue_member' && member.is_active === true,
    );
    const available = personnel.filter(member =>
      member.user_id && !member.team_id && !memberUserIds.has(member.user_id),
    );
    const assignedElsewhere = personnel.filter(member =>
      member.user_id && member.team_id && member.team_id !== team.id && !memberUserIds.has(member.user_id),
    );

    return <View style={styles.details}>
      <Text style={styles.detailHeading}>Team members</Text>
      {teamMembers.length === 0
        ? <Text style={styles.meta}>No responders have been added to this team yet.</Text>
        : teamMembers.map(member => {
          const isLeader = member.user_id === team.team_leader_id;
          const name = member.user?.name || member.user?.email || 'Unknown member';
          return <View key={member.id} style={[styles.memberRow, compact && styles.memberStack]}>
            <View style={styles.memberInfo}>
              <Text style={styles.optionName}>{name}</Text>
              {member.user?.email ? <Text style={styles.meta}>{member.user.email}</Text> : null}
              {member.user?.phone ? <Text style={styles.meta}>{member.user.phone}</Text> : null}
              {isLeader ? <Text style={styles.leaderBadge}>Team leader</Text> : null}
            </View>
            {isLeader
              ? <Text style={styles.meta}>Change the team leader before removing this member.</Text>
              : <Button
                variant="danger"
                label="Remove"
                disabled={saving}
                onPress={() => { void runTeamAction(() => teamService.removeTeamMember(team.id, member.id)); }}
              />}
          </View>;
        })}

      <Field label="Team leader" hint="Only an active rescue member already on this team can lead it.">
        <Text style={styles.meta}>{team.team_leader?.name || 'No leader selected'}</Text>
        <View style={styles.options}>
          {eligibleTeamMembers.map(member => <Button
            key={member.user_id}
            variant={member.user_id === team.team_leader_id ? 'primary' : 'secondary'}
            label={`Make team leader: ${member.user?.name || member.user?.email || 'member'}`}
            disabled={saving || member.user_id === team.team_leader_id}
            onPress={() => { if (member.user_id) void runTeamAction(() => teamService.updateTeam(team.id, { teamLeaderId: member.user_id })); }}
          />)}
          {team.team_leader_id ? <Button
            variant="secondary"
            label="Clear team leader"
            disabled={saving}
            onPress={() => { void runTeamAction(() => teamService.updateTeam(team.id, { teamLeaderId: null })); }}
          /> : null}
        </View>
      </Field>

      <Field label="Add eligible member" hint="Only unassigned active rescue members can be added.">
        {!team.is_active ? <Text style={styles.meta}>Activate this team before adding members.</Text> : null}
        {available.length === 0
          ? <Text style={styles.meta}>No unassigned active rescue members are available.</Text>
          : <View style={styles.options}>{available.map(member => <View key={member.id} style={[styles.memberRow, compact && styles.memberStack]}>
            <Text style={styles.optionName}>{member.name}</Text>
            <Button
              variant="secondary"
              label="Add"
              disabled={saving || !team.is_active || !member.user_id}
              onPress={() => {
                if (member.user_id) void runTeamAction(() => teamService.addTeamMember(team.id, { userId: member.user_id! }));
              }}
            />
          </View>)}</View>}
        {assignedElsewhere.length > 0
          ? <Text style={styles.meta}>{assignedElsewhere.length} active rescue member{assignedElsewhere.length === 1 ? ' is' : 's are'} excluded because already assigned to another team.</Text>
          : null}
      </Field>

      <Button
        variant="secondary"
        label={team.is_active ? 'Deactivate team' : 'Activate team'}
        disabled={saving}
        onPress={() => { void runTeamAction(() => teamService.updateTeam(team.id, { isActive: !team.is_active })); }}
      />
    </View>;
  };

  const eligibleToCreate = personnel.filter(member => !member.team_id);

  return <Screen>
    <PageHeader
      eyebrow="Organization"
      title="Response teams"
      description="View team membership and manage eligible rescue responders."
      action={<Button label="Create team" onPress={() => { setError(''); setOpen(true); }} />}
    />
    {error ? <ErrorState message={error} onRetry={load} /> : null}
    {loading
      ? <LoadingState rows={3} label="Loading response teams…" />
      : teams.length === 0
        ? <EmptyState
          title="No teams"
          message="Create a team, choose an active rescue member as leader, and add eligible responders."
          action={<Button label="Create first team" onPress={() => setOpen(true)} />}
        />
        : <View style={styles.grid}>{teams.map(team => {
          const ready = isTeamPresentationReady(team);
          const expanded = expandedTeamId === team.id;
          return <Card key={team.id} style={styles.team}>
            <View style={styles.head}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name}>{team.name}</Text>
                <Text style={styles.description}>{team.description || 'No team description'}</Text>
              </View>
              <StatusBadge value={team.is_active ? 'active' : 'inactive'} />
            </View>
            <View style={styles.readiness}>
              <Text style={styles.readinessLabel}>{ready ? 'Assignment ready' : 'Not assignment ready'}</Text>
              <Text style={styles.meta}>
                {(team.members || []).length} {(team.members || []).length === 1 ? 'member' : 'members'}
                {' · '}{team.team_leader?.name ? `Led by ${team.team_leader.name}` : 'No leader selected'}
              </Text>
            </View>
            {!ready ? <Banner title="Cannot respond yet" message="Add at least one eligible active rescue responder." tone="warning" /> : null}
            <Button
              variant="secondary"
              label={expanded ? 'Close management' : 'Manage team'}
              onPress={() => setExpandedTeamId(expanded ? null : team.id)}
            />
            {expanded ? renderTeamDetails(team) : null}
          </Card>;
        })}</View>}
    <Dialog
      visible={open}
      title="Create response team"
      onClose={() => setOpen(false)}
      footer={<View style={[styles.actions, compact && styles.memberStack]}>
        <Button variant="secondary" label="Cancel" onPress={() => setOpen(false)} />
        <Button label="Create team" onPress={() => { void create(); }} loading={saving} disabled={!form.name.trim() || !form.teamLeaderId} />
      </View>}
    >
      <View style={styles.form}>
        {error ? <Banner title="Team needs attention" message={error} tone="error" /> : null}
        <Field label="Team name"><Input accessibilityLabel="Team name" value={form.name} onChangeText={name => setForm(value => ({ ...value, name }))} /></Field>
        <Field label="Description"><TextArea value={form.description} onChangeText={description => setForm(value => ({ ...value, description }))} /></Field>
        <Field label="Team leader" hint="Choose an unassigned, active rescue member. A leader is required to create a team.">
          {eligibleToCreate.length === 0 ? <Banner title="No available responders" message="Invite a responder from Personnel, or review existing team assignments before creating a team." tone="info" /> : null}
          <View style={styles.options}>{eligibleToCreate.map(member => {
            const id = member.user_id || '';
            const selected = form.teamLeaderId === id;
            return <Pressable key={member.id} disabled={!id} onPress={() => selectLeader(id)} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} style={[styles.option, selected && styles.optionSelected]}>
              <Text style={styles.optionName}>{member.name}{selected ? ' — Leader' : ''}</Text>
            </Pressable>;
          })}</View>
        </Field>
        <Field label="Members" hint="The leader is included automatically.">
          <View style={styles.options}>{eligibleToCreate.map(member => {
            const id = member.user_id || '';
            const selected = form.selected.includes(id);
            const isLeader = form.teamLeaderId === id;
            return <Pressable key={member.id} disabled={!id || isLeader} onPress={() => toggleMember(id)} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} style={[styles.option, selected && styles.optionSelected]}>
              <Text style={styles.optionName}>{member.name}{isLeader ? ' — Leader' : selected ? ' — Selected' : ''}</Text>
            </Pressable>;
          })}</View>
          {personnel.some(member => member.team_id) ? <Text style={styles.meta}>Members assigned to another team are excluded.</Text> : null}
        </Field>
      </View>
    </Dialog>
  </Screen>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  team: { flexGrow: 1, flexBasis: '100%', minWidth: 0, maxWidth: 540, gap: space.md },
  head: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  name: { ...type.heading, color: colors.ink },
  description: { ...type.body, color: colors.muted, marginTop: space.xs },
  readiness: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  readinessLabel: { ...type.label, color: colors.ink },
  details: { gap: space.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  detailHeading: { ...type.heading, color: colors.ink },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  memberStack: { flexDirection: 'column', alignItems: 'stretch' },
  leaderBadge: { ...type.label, color: colors.brandDark, backgroundColor: colors.brandSoft, borderRadius: radius.sm, padding: space.sm, alignSelf: 'flex-start' },
  memberInfo: { flex: 1, minWidth: 0, gap: space.xs },
  meta: { ...type.caption, color: colors.muted, marginTop: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'flex-end' },
  form: { gap: space.lg },
  options: { gap: space.sm },
  option: { minHeight: 48, padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  optionSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  optionName: { ...type.label, color: colors.ink },
});
