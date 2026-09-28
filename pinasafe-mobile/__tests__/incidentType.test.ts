import { apiService } from '../services/apiService';

/**
 * N. Incident-type contract: the active EmergencyReportData.type must accept
 * 'road' | 'fire' and reject the stale 'rescue' value at the TypeScript level.
 * This file is compiled by ts-jest, so a type error here fails the test run.
 */
type IncidentType = Parameters<typeof apiService.createEmergencyReport>[0]['type'];

describe('incident-type contract (F2)', () => {
  test('road and fire are assignable incident types', () => {
    const road: IncidentType = 'road';
    const fire: IncidentType = 'fire';
    expect(['road', 'fire']).toContain(road);
    expect(['road', 'fire']).toContain(fire);
  });

  test('rescue is rejected at the TypeScript level', () => {
    // @ts-expect-error 'rescue' is not a valid incident type on the active contract
    const rescue: IncidentType = 'rescue';
    expect(rescue).toBe('rescue');
  });
});
