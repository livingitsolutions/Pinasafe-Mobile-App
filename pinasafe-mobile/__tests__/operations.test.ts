import { hasAuthoritativeCoordinates, isTeamPresentationReady } from '@/utils/operations';

describe('operational presentation policy', () => {
  test('map actions require finite backend coordinates', () => {
    expect(hasAuthoritativeCoordinates(undefined)).toBe(false);
    expect(hasAuthoritativeCoordinates({ latitude: Number.NaN, longitude: 124 })).toBe(false);
    expect(hasAuthoritativeCoordinates({ latitude: 10.25, longitude: 124.75 })).toBe(true);
  });

  test('inactive and empty teams are not presented as assignment ready', () => {
    expect(isTeamPresentationReady({ is_active: false, members: [{}] })).toBe(false);
    expect(isTeamPresentationReady({ is_active: true, members: [] })).toBe(false);
    expect(isTeamPresentationReady({ is_active: true, members: [{}] })).toBe(true);
  });
});
