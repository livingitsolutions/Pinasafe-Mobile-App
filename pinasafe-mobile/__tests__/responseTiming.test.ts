import { formatResponseTime, getOperationalResolutionDisplayTimestamp, getResolutionDisplayTimestamp } from '../utils/responseTiming';

const reported = '2026-10-07T06:23:34.000Z';
const resolved = '2026-10-07T06:38:49.000Z';
const updated = '2026-10-07T07:00:00.000Z';

describe('resolved timing display contract', () => {
  test('authoritative resolution wins over a later update', () => {
    const timestamp = getResolutionDisplayTimestamp({ status: 'resolved', resolved_at: resolved, updated_at: updated });
    expect(timestamp).toBe(resolved);
    expect(formatResponseTime(reported, timestamp)).toBe('15 min 15 sec');
  });

  test.each([undefined, null, '', 'invalid'])('unavailable resolution %s uses a valid resolved-only compatibility update', resolved_at => {
    expect(getResolutionDisplayTimestamp({ status: 'resolved', resolved_at, updated_at: updated })).toBe(updated);
  });

  test.each(['pending', 'dispatched', 'responding'])('%s never has a resolution display timestamp', status => {
    expect(getResolutionDisplayTimestamp({ status, resolved_at: resolved, updated_at: updated })).toBeNull();
  });

  test.each([
    [null, resolved], [reported, undefined], ['invalid', resolved], [reported, 'invalid'],
    [resolved, reported], ['', resolved],
  ])('invalid or negative duration from %s to %s is omitted', (start, end) => {
    expect(formatResponseTime(start, end)).toBeNull();
  });

  test.each([
    [0, '0 sec'], [42, '42 sec'], [45, '45 sec'], [65, '1 min 5 sec'],
    [915, '15 min 15 sec'], [3599, '59 min 59 sec'], [3600, '1 hr 0 min'],
    [4320, '1 hr 12 min'], [7500, '2 hr 5 min'], [97200, '1 day 3 hr'], [172800, '2 days 0 hr'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatResponseTime(reported, new Date(Date.parse(reported) + seconds * 1000).toISOString())).toBe(expected);
  });

  test('operational closure uses the latest member resolution, not creation or update', () => {
    const timestamp = getOperationalResolutionDisplayTimestamp({ status: 'resolved', memberReports: [
      { status: 'resolved', resolved_at: '2026-10-07T06:30:00.000Z', updated_at: updated },
      { status: 'resolved', resolved_at: resolved, updated_at: updated },
    ] });
    expect(timestamp).toBe(resolved);
    expect(formatResponseTime(reported, timestamp)).toBe('15 min 15 sec');
  });

  test('operational closure considers a resolved member compatibility fallback and ignores unusable members', () => {
    expect(getOperationalResolutionDisplayTimestamp({ status: 'resolved', memberReports: [
      { status: 'resolved', resolved_at: resolved },
      { status: 'resolved', updated_at: updated },
      { status: 'resolved', resolved_at: 'invalid', updated_at: 'invalid' },
    ] })).toBe(updated);
  });

  test('no usable member timestamp means no operational closure display', () => {
    expect(getOperationalResolutionDisplayTimestamp({ status: 'resolved', memberReports: [{ status: 'resolved' }] })).toBeNull();
  });

  test('empty or partially active incidents have no operational closure display', () => {
    expect(getOperationalResolutionDisplayTimestamp({ status: 'resolved', memberReports: [] })).toBeNull();
    expect(getOperationalResolutionDisplayTimestamp({ status: 'resolved', memberReports: [
      { status: 'resolved', resolved_at: resolved }, { status: 'responding', updated_at: updated },
    ] })).toBeNull();
    expect(getOperationalResolutionDisplayTimestamp({ status: 'responding', memberReports: [{ status: 'resolved', resolved_at: resolved }] })).toBeNull();
  });
});
