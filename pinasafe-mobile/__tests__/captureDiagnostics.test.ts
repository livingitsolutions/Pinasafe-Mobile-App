import React, { useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import CameraCapture, { createCameraDiagnostics } from '../components/CameraCapture';
import { locationService, LocationData } from '../hooks/locationService';
import {
  CAPTURE_LOCATION_TIMEOUT_MS,
  CAPTURE_PHOTO_TIMEOUT_MS,
  CaptureFailureBoundary,
  captureWithLocation,
  validatePhotoCaptureResult,
} from '../utils/evidenceFlow';

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: jest.fn(),
  useRef: jest.fn(),
  useEffect: jest.fn(),
  useCallback: (callback: unknown) => callback,
}));
jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Alert: { alert: jest.fn() },
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
}));
jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));
jest.mock('lucide-react-native', () => ({ Camera: 'Camera', RotateCcw: 'RotateCcw', X: 'X' }));
jest.mock('../hooks/locationService', () => ({ locationService: { getCurrentLocation: jest.fn() } }));

const now = Date.parse('2026-10-05T00:00:00.000Z');
const freshLocation = (): LocationData => ({
  coords: { latitude: 0, longitude: 1, accuracy: 5 },
  timestamp: now,
});
const photo = { uri: 'synthetic-photo' };

type TestElementProps = {
  children?: React.ReactNode;
  onPress?: () => Promise<void>;
  onPressIn?: () => void;
};

function findShutter(node: React.ReactNode): () => Promise<void> {
  if (React.isValidElement<TestElementProps>(node)) {
    if (node.props.onPressIn && node.props.onPress) return node.props.onPress;
    for (const child of React.Children.toArray(node.props.children)) {
      const found = findShutterOrNull(child);
      if (found) return found;
    }
  }
  throw new Error('Test shutter was not found');
}

function findShutterOrNull(node: React.ReactNode): (() => Promise<void>) | null {
  if (!React.isValidElement<TestElementProps>(node)) return null;
  if (node.props.onPressIn && node.props.onPress) return node.props.onPress;
  for (const child of React.Children.toArray(node.props.children)) {
    const found = findShutterOrNull(child);
    if (found) return found;
  }
  return null;
}

function mountReadyCapture(diagnostics = createCameraDiagnostics(true)) {
  const camera = { takePictureAsync: jest.fn().mockResolvedValue(photo) };
  const attempt = { current: 0 };
  const onCapture = jest.fn().mockResolvedValue(undefined);
  const stateValues = ['back', false, true, 0, diagnostics];
  const refs = [{ current: camera }, attempt, { current: 0 }];
  (useState as jest.Mock).mockImplementation(() => [stateValues.shift(), jest.fn()]);
  (useRef as jest.Mock).mockImplementation(() => refs.shift());
  const tree = CameraCapture({ onCapture, onCancel: jest.fn() });
  return { diagnostics, camera, attempt, onCapture, press: findShutter(tree) };
}

describe('V3.3A.1 fixed capture failure boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.mocked(locationService.getCurrentLocation).mockResolvedValue(freshLocation());
    jest.mocked(ImageManipulator.manipulateAsync).mockResolvedValue({ uri: 'synthetic-normalized', width: 500, height: 500 });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test.each<[string, unknown, CaptureFailureBoundary]>([
    ['null location', null, 'location-unavailable'],
    ['missing time', { coords: freshLocation().coords }, 'location-time-invalid'],
    ['non-finite time', { ...freshLocation(), timestamp: NaN }, 'location-time-invalid'],
    ['infinite time', { ...freshLocation(), timestamp: Infinity }, 'location-time-invalid'],
    ['stale time', { ...freshLocation(), timestamp: now - 5001 }, 'location-stale'],
    ['future time', { ...freshLocation(), timestamp: now + 1001 }, 'location-future'],
    ['missing coordinates', { timestamp: now }, 'location-shape-error'],
    ['invalid latitude', { ...freshLocation(), coords: { latitude: 91, longitude: 1 } }, 'location-contract-invalid'],
    ['missing longitude', { ...freshLocation(), coords: { latitude: 0 } }, 'location-contract-invalid'],
    ['negative accuracy', { ...freshLocation(), coords: { ...freshLocation().coords, accuracy: -1 } }, 'location-contract-invalid'],
    ['non-finite accuracy', { ...freshLocation(), coords: { ...freshLocation().coords, accuracy: NaN } }, 'location-contract-invalid'],
  ])('%s is classified at the failing guard', async (_description, location, boundary) => {
    jest.mocked(locationService.getCurrentLocation).mockResolvedValue(location as LocationData | null);
    const capture = mountReadyCapture();
    await capture.press();
    expect(capture.diagnostics.getSnapshot()).toMatchObject({
      photoReturned: true, locationReturned: true, manipulationInvoked: false,
      failureBoundary: boundary, lastEvent: 'capture-error',
    });
    expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
    expect(capture.onCapture).not.toHaveBeenCalled();
  });

  test.each([undefined, null, {}, { uri: '' }])('missing photo URI fails closed', async result => {
    const capture = mountReadyCapture();
    capture.camera.takePictureAsync.mockResolvedValue(result);
    await capture.press();
    expect(capture.diagnostics.getSnapshot().failureBoundary).toBe('photo-uri-missing');
    expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
    expect(capture.onCapture).not.toHaveBeenCalled();
  });

  test('a photo property exception retains its identity and gets a fixed label', () => {
    const original = new Error('synthetic-private-error');
    const report = jest.fn();
    const result = { get uri(): string { throw original; } };
    try {
      validatePhotoCaptureResult(result, report);
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(error).toBe(original);
    }
    expect(report.mock.calls).toEqual([['photo-result-validation-error']]);
  });

  test('normalization exceptions retain their identity and get a fixed label', async () => {
    const original = new Error('synthetic-private-error');
    const location = { ...freshLocation(), get address(): string { throw original; } };
    const report = jest.fn();
    await expect(captureWithLocation(async () => photo, async () => location, report)).rejects.toBe(original);
    expect(report.mock.calls).toEqual([['location-normalization-error']]);
  });

  test.each([now - 5000, now + 1000])('freshness boundaries still accept the exact permitted edges', async timestamp => {
    const report = jest.fn();
    const result = await captureWithLocation(async () => photo, async () => ({ ...freshLocation(), timestamp }), report);
    expect(result.photo).toBe(photo);
    expect(Object.isFrozen(result.captureLocation)).toBe(true);
    expect(report).not.toHaveBeenCalled();
  });

  test.each([
    [NaN, 'location-time-invalid', 1, 1],
    [now - 5001, 'location-stale', 2, 1],
    [now + 1001, 'location-future', 3, 2],
  ] as const)('time guard preserves short-circuit order for %s', async (timestamp, boundary, reads, clockReads) => {
    let timestampReads = 0;
    const location: LocationData = {
      get timestamp() { timestampReads += 1; return timestamp; },
      get coords(): LocationData['coords'] { throw new Error('Coordinate access must not run'); },
    };
    const report = jest.fn();
    await expect(captureWithLocation(async () => photo, async () => location, report)).rejects.toThrow('A current capture location is required.');
    expect(timestampReads).toBe(reads);
    expect(Date.now).toHaveBeenCalledTimes(clockReads);
    expect(report.mock.calls).toEqual([[boundary]]);
  });

  test('date conversion exceptions retain their original identity', async () => {
    const original = new Error('synthetic-private-error');
    jest.spyOn(Date.prototype, 'toISOString').mockImplementation(() => { throw original; });
    const report = jest.fn();
    await expect(captureWithLocation(async () => photo, async () => freshLocation(), report)).rejects.toBe(original);
    expect(report.mock.calls).toEqual([['location-normalization-error']]);
  });

  test('valid fresh capture completes with none and invokes the callback once', async () => {
    const capture = mountReadyCapture();
    await capture.press();
    expect(capture.diagnostics.getSnapshot()).toMatchObject({ failureBoundary: 'none', lastEvent: 'capture-complete' });
    expect(capture.onCapture).toHaveBeenCalledTimes(1);
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledTimes(1);
  });

  test('a new successful session clears an earlier failure boundary', async () => {
    const diagnostics = createCameraDiagnostics(true);
    jest.mocked(locationService.getCurrentLocation).mockResolvedValueOnce(null);
    await mountReadyCapture(diagnostics).press();
    expect(diagnostics.getSnapshot().failureBoundary).toBe('location-unavailable');
    const retake = mountReadyCapture(diagnostics);
    await retake.press();
    expect(diagnostics.getSnapshot()).toMatchObject({ failureBoundary: 'none', attempt: 1, generation: 0 });
    expect(retake.onCapture).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['capture-returned', 'photo-return-diagnostic-error'],
    ['location-returned', 'location-return-diagnostic-error'],
    ['manipulation-invoked', 'manipulation-marker-diagnostic-error'],
  ] as const)('%s subscriber errors are fixed-label only and do not replace valid capture', async (event, boundary) => {
    const diagnostics = createCameraDiagnostics(true);
    diagnostics.subscribe(() => {
      if (diagnostics.getSnapshot().lastEvent === event) throw new Error('synthetic-private-error');
    });
    const observed: CaptureFailureBoundary[] = [];
    diagnostics.subscribe(() => { observed.push(diagnostics.getSnapshot().failureBoundary); });
    const capture = mountReadyCapture(diagnostics);
    await capture.press();
    expect(observed).toContain(boundary);
    expect(capture.onCapture).toHaveBeenCalledTimes(1);
    expect(diagnostics.getSnapshot()).toMatchObject({ failureBoundary: 'none', lastEvent: 'capture-complete' });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test.each([
    ['capture-returned', 'photo-return-diagnostic-error'],
    ['location-returned', 'location-return-diagnostic-error'],
    ['manipulation-invoked', 'manipulation-marker-diagnostic-error'],
  ] as const)('%s console errors do not replace valid capture', async (event, boundary) => {
    const observed: CaptureFailureBoundary[] = [];
    const diagnostics = createCameraDiagnostics(true);
    diagnostics.subscribe(() => { observed.push(diagnostics.getSnapshot().failureBoundary); });
    jest.mocked(console.info).mockImplementation((_label, snapshot) => {
      if (snapshot.lastEvent === event) throw new Error('synthetic-private-error');
    });
    const capture = mountReadyCapture(diagnostics);
    await capture.press();
    expect(observed).toContain(boundary);
    expect(capture.onCapture).toHaveBeenCalledTimes(1);
    expect(diagnostics.getSnapshot().failureBoundary).toBe('none');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test('always-throwing subscribers and console cannot break capture or the success reset', async () => {
    const diagnostics = createCameraDiagnostics(true);
    diagnostics.subscribe(() => { throw new Error('synthetic-private-error'); });
    jest.mocked(console.info).mockImplementation(() => { throw new Error('synthetic-private-error'); });
    const capture = mountReadyCapture(diagnostics);
    await capture.press();
    expect(capture.onCapture).toHaveBeenCalledTimes(1);
    expect(diagnostics.getSnapshot()).toMatchObject({ failureBoundary: 'none', lastEvent: 'capture-complete' });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test('throwing boundary observer cannot replace the original production failure', async () => {
    const observer = jest.fn(() => { throw new Error('synthetic-observer-error'); });
    await expect(captureWithLocation(async () => photo, async () => null, observer)).rejects.toThrow('A current capture location is required.');
    expect(observer).toHaveBeenCalledWith('location-unavailable');
    expect(() => validatePhotoCaptureResult(undefined, observer)).toThrow('Failed to capture image.');
  });

  test('reporter failures cannot overwrite a real capture failure category', async () => {
    const diagnostics = createCameraDiagnostics(true);
    diagnostics.subscribe(() => { throw new Error('synthetic-private-error'); });
    jest.mocked(console.info).mockImplementation(() => { throw new Error('synthetic-private-error'); });
    jest.mocked(locationService.getCurrentLocation).mockResolvedValue(null);
    const capture = mountReadyCapture(diagnostics);
    await capture.press();
    expect(diagnostics.getSnapshot()).toMatchObject({ failureBoundary: 'location-unavailable', lastEvent: 'capture-error' });
    expect(capture.onCapture).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['location', CAPTURE_LOCATION_TIMEOUT_MS, 'location-timeout'],
    ['photo', CAPTURE_PHOTO_TIMEOUT_MS, 'photo-timeout'],
  ] as const)('%s timeout preserves the controlled category', async (operation, delay, boundary) => {
    jest.useFakeTimers();
    const capture = mountReadyCapture();
    if (operation === 'location') {
      jest.mocked(locationService.getCurrentLocation).mockReturnValue(new Promise(() => {}));
    } else {
      capture.camera.takePictureAsync.mockReturnValue(new Promise(() => {}));
    }
    const pending = capture.press();
    await jest.advanceTimersByTimeAsync(delay);
    await pending;
    expect(capture.diagnostics.getSnapshot()).toMatchObject({
      failureBoundary: boundary, lastEvent: operation === 'photo' ? 'photo-timeout' : 'capture-error',
    });
    expect(capture.onCapture).not.toHaveBeenCalled();
  });

  test('late location return cannot erase the winning location timeout category', async () => {
    jest.useFakeTimers();
    let finishLocation!: (location: LocationData) => void;
    jest.mocked(locationService.getCurrentLocation).mockReturnValue(new Promise(resolve => { finishLocation = resolve; }));
    const capture = mountReadyCapture();
    const pending = capture.press();
    await jest.advanceTimersByTimeAsync(CAPTURE_LOCATION_TIMEOUT_MS);
    await pending;
    finishLocation(freshLocation());
    await jest.advanceTimersByTimeAsync(1);
    expect(capture.diagnostics.getSnapshot()).toMatchObject({
      photoReturned: true, locationReturned: true, failureBoundary: 'location-timeout', manipulationInvoked: false,
    });
    expect(capture.onCapture).not.toHaveBeenCalled();
  });

  test('obsolete fulfillment does not publish a current failure or reach manipulation', async () => {
    const capture = mountReadyCapture();
    let finishPhoto!: (result: typeof photo) => void;
    capture.camera.takePictureAsync.mockReturnValue(new Promise(resolve => { finishPhoto = resolve; }));
    const pending = capture.press();
    capture.attempt.current += 1;
    jest.mocked(console.info).mockImplementation(() => { throw new Error('synthetic-private-error'); });
    finishPhoto(photo);
    await pending;
    expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
    expect(capture.onCapture).not.toHaveBeenCalled();
    expect(capture.diagnostics.getSnapshot().failureBoundary).toBe('none');
  });

  test('obsolete rejection does not overwrite the current diagnostic field', async () => {
    const capture = mountReadyCapture();
    let rejectPhoto!: (error: Error) => void;
    capture.camera.takePictureAsync.mockReturnValue(new Promise((_resolve, reject) => { rejectPhoto = reject; }));
    const pending = capture.press();
    capture.attempt.current += 1;
    capture.diagnostics.update({ failureBoundary: 'location-future' });
    rejectPhoto(new Error('synthetic-private-error'));
    await pending;
    expect(capture.onCapture).not.toHaveBeenCalled();
    expect(capture.diagnostics.getSnapshot().failureBoundary).toBe('location-future');
  });

  test('an attempt superseded during manipulation cannot reach the callback', async () => {
    const capture = mountReadyCapture();
    jest.mocked(ImageManipulator.manipulateAsync).mockImplementation(async () => {
      capture.attempt.current += 1;
      return { uri: 'synthetic-normalized', width: 500, height: 500 };
    });
    await capture.press();
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledTimes(1);
    expect(capture.onCapture).not.toHaveBeenCalled();
    expect(capture.diagnostics.getSnapshot().failureBoundary).toBe('none');
  });

  test('arbitrary error text does not determine or leak into the category', async () => {
    const capture = mountReadyCapture();
    capture.camera.takePictureAsync.mockRejectedValue(new Error('location-stale synthetic-private-error'));
    await capture.press();
    expect(capture.diagnostics.getSnapshot().failureBoundary).toBe('post-capture-unexpected');
    for (const [label, snapshot] of jest.mocked(console.info).mock.calls) {
      expect(label).toBe('Camera diagnostics');
      expect(JSON.stringify(snapshot)).not.toMatch(/synthetic|uri|timestamp|latitude|longitude|address|payload|token/i);
      expect(Object.values(snapshot).every(value => value === null || ['string', 'boolean', 'number'].includes(typeof value))).toBe(true);
    }
  });
});
