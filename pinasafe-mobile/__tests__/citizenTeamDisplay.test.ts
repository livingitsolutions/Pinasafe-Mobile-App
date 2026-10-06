import fs from 'fs';
import path from 'path';
import React, { useState } from 'react';
import type { CitizenResponseTracking } from '@/services/apiService';
import { describeCitizenTeam } from '@/utils/responseRoute';
import CitizenResponseTrackingPanel from '@/components/CitizenResponseTracking';

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: jest.fn(),
  useRef: () => ({ current: false }),
  useEffect: jest.fn(),
  useCallback: (callback: unknown) => callback,
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (options: { web?: unknown; default?: unknown }) => options.web ?? options.default },
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View',
}));
jest.mock('@/components/RouteMap', () => 'RouteMap');
jest.mock('@/components/ui', () => ({ Banner: 'Banner', Button: 'Button' }));
jest.mock('@/services/apiService', () => ({ apiService: { getCitizenResponseTracking: jest.fn() } }));

const NOW = Date.parse('2026-10-06T10:00:00.000Z');
const snapshot = (overrides: Partial<CitizenResponseTracking> = {}): CitizenResponseTracking => ({
  status: 'responding', response_team_assigned: true, response_team: { name: 'Team Alpha' }, tracking_active: true, response_complete: false,
  incident_location: { latitude: 14.6, longitude: 121 },
  responder_location: { latitude: 14.55, longitude: 121.05, captured_at: '2026-10-06T09:59:55.000Z', freshness: 'fresh' },
  route_status: 'available', route: [[14.55, 121.05], [14.6, 121]], distance_meters: 6400, duration_seconds: 780, calculated_at: '2026-10-06T09:59:58.000Z',
  ...overrides,
});

const textOf = (node: React.ReactNode): string[] => {
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return React.Children.toArray(node.props.children).flatMap(textOf);
};

const render = (data: CitizenResponseTracking) => {
  const values: unknown[] = [data, false, NOW];
  (useState as jest.Mock).mockImplementation(() => [values.shift(), jest.fn()]);
  return textOf(CitizenResponseTrackingPanel({ reportId: 'report-1' }));
};

describe('V3.6C.1A citizen assigned response team display', () => {
  test('10. live panel shows the assigned team name with its lifecycle', () => {
    const text = render(snapshot());
    expect(text).toContain('Assigned Response Team');
    expect(text).toContain('Team Alpha');
    expect(text).toContain('Responding');
    expect(text).toContain('LIVE');
    expect(text).toContain('~13 min');
  });

  test('10b. dispatched (before Respond) still shows the team name', () => {
    const text = render(snapshot({ status: 'dispatched', tracking_active: false, responder_location: null, route_status: 'not_applicable', route: null, duration_seconds: null, distance_meters: null }));
    expect(text).toEqual(expect.arrayContaining(['Response team assigned', 'Assigned Response Team', 'Team Alpha', 'Dispatched']));
  });

  test('11. an assignment never renders "Not available"', () => {
    [snapshot(), snapshot({ status: 'dispatched', tracking_active: false, responder_location: null })].forEach(data => {
      expect(render(data).join(' ')).not.toMatch(/not available/i);
    });
  });

  test('9. unassigned shows the waiting state and no team block', () => {
    const text = render(snapshot({ status: 'pending', response_team_assigned: false, response_team: null, tracking_active: false, responder_location: null }));
    expect(text).toContain('Waiting for a response team');
    expect(text).not.toContain('Assigned Response Team');
  });

  test('resolved incident labels the team as resolved', () => {
    expect(describeCitizenTeam(snapshot({ status: 'resolved', response_complete: true, tracking_active: false }))).toEqual({ name: 'Team Alpha', lifecycle: 'Resolved' });
  });

  test.each([null, { name: '' }, { name: '   ' }])('no team name is ever fabricated for %p', team => {
    expect(describeCitizenTeam(snapshot({ response_team: team }))).toBeNull();
  });

  test('citizen detail card hides the generic team row so only one team display exists', () => {
    const detail = fs.readFileSync(path.join(__dirname, '..', 'app/incident/[id].tsx'), 'utf8');
    expect(detail).toMatch(/user\?\.role === 'citizen' \? null : <DetailItem label="Assigned team"/);
    const panel = fs.readFileSync(path.join(__dirname, '..', 'components/CitizenResponseTracking.tsx'), 'utf8');
    expect(panel).not.toMatch(/team_id|assigned_team|responder_name|responder_id|getResponderNavigation|rescue_teams/);
    expect(panel.match(/Assigned Response Team/g)).toHaveLength(1);
  });
});
