const { validateCaptureLocation } = require('../services/captureLocationContract');

const validCapture = {
  captureLatitude: '10.5',
  captureLongitude: '124.9',
  capturedAt: '2026-10-02T08:00:00+08:00'
};

describe('capture location contract', () => {
  test.each([
    ['latitude', { captureLatitude: undefined }],
    ['longitude', { captureLongitude: undefined }],
    ['capturedAt', { capturedAt: undefined }]
  ])('requires %s', (_, override) => {
    expect(validateCaptureLocation({ ...validCapture, ...override }).valid).toBe(false);
  });

  test('accepts valid values, optional accuracy, and normalizes a qualified timestamp', () => {
    expect(validateCaptureLocation(validCapture)).toEqual({
      valid: true,
      captureLocation: {
        latitude: 10.5,
        longitude: 124.9,
        accuracy: null,
        capturedAt: '2026-10-02T00:00:00.000Z'
      }
    });
    expect(validateCaptureLocation({ ...validCapture, captureAccuracy: '0' }).valid).toBe(true);
  });

  test.each([
    ['southwest boundaries', '-90', '-180'],
    ['northeast boundaries', '90', '180']
  ])('accepts %s', (_, captureLatitude, captureLongitude) => {
    expect(validateCaptureLocation({
      ...validCapture,
      captureLatitude,
      captureLongitude
    }).valid).toBe(true);
  });

  test.each([
    ['latitude above range', { captureLatitude: '90.0001' }],
    ['latitude below range', { captureLatitude: '-90.0001' }],
    ['longitude above range', { captureLongitude: '180.0001' }],
    ['longitude below range', { captureLongitude: '-180.0001' }],
    ['negative accuracy', { captureAccuracy: '-0.01' }],
    ['NaN', { captureLatitude: 'NaN' }],
    ['positive Infinity', { captureLongitude: 'Infinity' }],
    ['negative Infinity', { captureAccuracy: '-Infinity' }],
    ['numeric suffix', { captureLatitude: '12abc' }],
    ['numeric prefix', { captureLongitude: 'abc12' }],
    ['leading whitespace', { captureLatitude: ' 10' }],
    ['trailing whitespace', { captureLongitude: '124 ' }],
    ['empty optional accuracy', { captureAccuracy: '' }],
    ['malformed date', { capturedAt: '2026-02-30T00:00:00Z' }],
    ['timestamp without timezone', { capturedAt: '2026-10-02T08:00:00' }],
    ['ambiguous local timestamp', { capturedAt: '2026-10-02 08:00:00' }],
    ['unknown timezone offset', { capturedAt: '2026-10-02T08:00:00-00:00' }]
  ])('rejects %s', (_, override) => {
    expect(validateCaptureLocation({ ...validCapture, ...override }).valid).toBe(false);
  });
});