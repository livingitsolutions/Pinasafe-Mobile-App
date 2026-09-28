import { acquireSubmissionLock, buildDurableReportPayload, countAcceptedEvidence, MAX_ACCEPTED_EVIDENCE } from '../utils/evidenceFlow';

describe('durable citizen evidence flow', () => {
  test('only accepted evidence counts toward the maximum of five', () => {
    const items = [
      ...Array.from({ length: MAX_ACCEPTED_EVIDENCE }, (_, index) => ({ localId: `${index}`, uri: 'local', status: 'accepted' as const })),
      { localId: 'rejected', uri: 'local', status: 'rejected' as const },
      { localId: 'error', uri: 'local', status: 'error' as const },
    ];
    expect(countAcceptedEvidence(items)).toBe(5);
  });

  test.each(['road', 'fire'] as const)('builds a %s report with the durable binding identifier', type => {
    expect(buildDurableReportPayload({
      type, description: '  A detailed incident  ', location: '  Main Road  ', uploadSessionId: 'session-id',
    })).toEqual({
      type, description: 'A detailed incident', location: 'Main Road', contactNumber: undefined,
      priority: 'high', coordinates: undefined, uploadSessionId: 'session-id',
    });
  });

  test('prevents a duplicate final submission while the first is active', () => {
    const lock = { current: false };
    expect(acquireSubmissionLock(lock)).toBe(true);
    expect(acquireSubmissionLock(lock)).toBe(false);
  });
});
