import { hasAuthoritativeCoordinates, isTeamPresentationReady } from '@/utils/operations';

describe('operational presentation policy', () => {
  test('map actions require finite backend coordinates', () => {
    expect(hasAuthoritativeCoordinates(undefined)).toBe(false);
    expect(hasAuthoritativeCoordinates({ latitude: Number.NaN, longitude: 124 })).toBe(false);
    expect(hasAuthoritativeCoordinates({ latitude: 10.25, longitude: 124.75 })).toBe(true);
  });

  test('inactive team is not assignment ready', () => {
    expect(isTeamPresentationReady({ is_active: false, members: [{ personnel_role: 'rescue_member', is_active: true }] })).toBe(false);
  });

  test('empty team is not assignment ready', () => {
    expect(isTeamPresentationReady({ is_active: true, members: [] })).toBe(false);
  });

  test('team with only staff members is not assignment ready', () => {
    expect(isTeamPresentationReady({ is_active: true, members: [{ personnel_role: 'staff', is_active: true }] })).toBe(false);
  });

  test('team with inactive rescue_member is not assignment ready', () => {
    expect(isTeamPresentationReady({ is_active: true, members: [{ personnel_role: 'rescue_member', is_active: false }] })).toBe(false);
  });

  test('team with active rescue_member is assignment ready', () => {
    expect(isTeamPresentationReady({ is_active: true, members: [{ personnel_role: 'rescue_member', is_active: true }] })).toBe(true);
  });

  test('team with mixed members including active rescue_member is assignment ready', () => {
    expect(isTeamPresentationReady({
      is_active: true,
      members: [
        { personnel_role: 'staff', is_active: true },
        { personnel_role: 'rescue_member', is_active: true },
      ],
    })).toBe(true);
  });
});
