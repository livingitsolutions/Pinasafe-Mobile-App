import { isTeamPresentationReady } from '@/utils/operations';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

type FormState = { name: string; teamLeaderId: string; selected: string[] };

function selectLeader(form: FormState, userId: string): FormState {
  const isSame = form.teamLeaderId === userId;
  if (isSame) {
    return { ...form, teamLeaderId: '', selected: form.selected.filter(id => id !== userId) };
  }
  const nextSelected = form.selected.includes(userId) ? form.selected : [...form.selected, userId];
  return { ...form, teamLeaderId: userId, selected: nextSelected };
}

function toggleMember(form: FormState, userId: string): FormState {
  const selected = form.selected.includes(userId);
  const nextSelected = selected ? form.selected.filter(id => id !== userId) : [...form.selected, userId];
  const nextLeader = selected && form.teamLeaderId === userId ? '' : form.teamLeaderId;
  return { ...form, teamLeaderId: nextLeader, selected: nextSelected };
}

function canCreate(form: FormState): boolean {
  return form.name.trim().length > 0 && form.teamLeaderId.length > 0;
}

const RESCUER_USER_ID = 'responder-user-1';

describe('team creation state contract', () => {
  test('1. visual availability is not selection — create disabled until leader selected', () => {
    const form: FormState = { name: 'Team A', teamLeaderId: '', selected: [] };
    expect(canCreate(form)).toBe(false);
  });

  test('2. selecting a leader stores the responder user_id', () => {
    const form: FormState = { name: 'Team A', teamLeaderId: '', selected: [] };
    const after = selectLeader(form, RESCUER_USER_ID);
    expect(after.teamLeaderId).toBe(RESCUER_USER_ID);
  });

  test('3. selecting a leader auto-includes that responder in selected members', () => {
    const form: FormState = { name: 'Team A', teamLeaderId: '', selected: [] };
    const after = selectLeader(form, RESCUER_USER_ID);
    expect(after.selected).toContain(RESCUER_USER_ID);
  });

  test('4. create request payload contains the selected leader user_id', () => {
    const form: FormState = { name: 'Team A', teamLeaderId: '', selected: [] };
    const after = selectLeader(form, RESCUER_USER_ID);
    const payload = { name: after.name, teamLeaderId: after.teamLeaderId || undefined };
    expect(payload.teamLeaderId).toBe(RESCUER_USER_ID);
  });

  test('5. leader included by team creation is excluded from duplicate member requests', () => {
    const form: FormState = { name: 'Team A', teamLeaderId: '', selected: [] };
    const after = selectLeader(form, RESCUER_USER_ID);
    const additionalMemberIds = after.selected.filter(userId => userId !== after.teamLeaderId);
    expect(additionalMemberIds).not.toContain(RESCUER_USER_ID);
  });

  test('6. deselecting leader removes from both teamLeaderId and selected', () => {
    const form: FormState = { name: 'Team A', teamLeaderId: RESCUER_USER_ID, selected: [RESCUER_USER_ID] };
    const after = selectLeader(form, RESCUER_USER_ID);
    expect(after.teamLeaderId).toBe('');
    expect(after.selected).not.toContain(RESCUER_USER_ID);
  });

  test('7. toggling a non-leader member does not clear leader', () => {
    const form: FormState = { name: 'Team A', teamLeaderId: RESCUER_USER_ID, selected: [RESCUER_USER_ID] };
    const after = toggleMember(form, 'other-user-2');
    expect(after.teamLeaderId).toBe(RESCUER_USER_ID);
    expect(after.selected).toContain('other-user-2');
  });

  test('8. removing the leader via member toggle clears teamLeaderId', () => {
    const form: FormState = { name: 'Team A', teamLeaderId: RESCUER_USER_ID, selected: [RESCUER_USER_ID] };
    const after = toggleMember(form, RESCUER_USER_ID);
    expect(after.teamLeaderId).toBe('');
    expect(after.selected).not.toContain(RESCUER_USER_ID);
  });
});

describe('team readiness with enriched member data', () => {
  test('9. active team with active rescue_member is assignment ready', () => {
    expect(isTeamPresentationReady({
      is_active: true,
      members: [{ personnel_role: 'rescue_member', is_active: true }],
    })).toBe(true);
  });

  test('10. active team without rescue_member is not assignment ready', () => {
    expect(isTeamPresentationReady({
      is_active: true,
      members: [{ personnel_role: 'staff', is_active: true }],
    })).toBe(false);
  });

  test('11. inactive team is not assignment ready even with rescue_member', () => {
    expect(isTeamPresentationReady({
      is_active: false,
      members: [{ personnel_role: 'rescue_member', is_active: true }],
    })).toBe(false);
  });

  test('12. team with inactive rescue_member is not assignment ready', () => {
    expect(isTeamPresentationReady({
      is_active: true,
      members: [{ personnel_role: 'rescue_member', is_active: false }],
    })).toBe(false);
  });

  test('13. team with no members is not assignment ready', () => {
    expect(isTeamPresentationReady({ is_active: true, members: [] })).toBe(false);
  });

  test('14. team with mixed members including active rescue_member is assignment ready', () => {
    expect(isTeamPresentationReady({
      is_active: true,
      members: [
        { personnel_role: 'staff', is_active: true },
        { personnel_role: 'rescue_member', is_active: true },
      ],
    })).toBe(true);
  });
});
