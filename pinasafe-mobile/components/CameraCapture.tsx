import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Camera as CameraIcon, RotateCcw, X } from 'lucide-react-native';
import { locationService } from '@/hooks/locationService';
import {
  captureWithLocation,
  CaptureFailureBoundary,
  CaptureLocation,
  getShutterState,
  isPhotoCaptureTimeout,
  validatePhotoCaptureResult,
} from '@/utils/evidenceFlow';

interface CameraCaptureProps {
  onCapture: (uri: string, captureLocation: CaptureLocation) => Promise<void>;
  onCancel: () => void;
}

const CAMERA_DIAGNOSTICS_ENABLED = true;

type DiagnosticEvent =
  | 'mounted' | 'unmounted' | 'ref-attached' | 'ref-detached'
  | 'camera-ready' | 'camera-ready-ignored' | 'controls-touch'
  | 'shutter-press-in' | 'shutter-press' | 'handler-entered'
  | 'handler-blocked-permission' | 'handler-blocked-ref'
  | 'handler-blocked-ready' | 'handler-blocked-processing'
  | 'processing' | 'capture-invoked' | 'capture-returned'
  | 'location-wait' | 'location-returned' | 'manipulation-invoked'
  | 'manipulation-returned' | 'callback-invoked' | 'capture-complete'
  | 'capture-error' | 'photo-timeout' | 'generation-restarted' | 'attempt-obsolete';

type CameraDiagnosticState = {
  generation: number;
  readyGeneration: number;
  attempt: number;
  permission: boolean;
  refAttached: boolean;
  ready: boolean;
  readyCallbackReceived: boolean;
  readyGenerationMatches: boolean;
  readyCallbackGeneration: number;
  processing: boolean;
  shutterEnabled: boolean;
  shutterReason: ReturnType<typeof getShutterState>['reason'];
  controlsTouch: boolean;
  pressIn: boolean;
  press: boolean;
  handlerEntered: boolean;
  captureInvoked: boolean;
  photoReturned: boolean;
  locationReturned: boolean;
  manipulationInvoked: boolean;
  manipulationReturned: boolean;
  callbackInvoked: boolean;
  failureBoundary: CaptureFailureBoundary;
  lastEvent: DiagnosticEvent;
};

export function createCameraDiagnostics(permission: boolean) {
  let snapshot: CameraDiagnosticState = {
    generation: 0, readyGeneration: 0, attempt: 0,
    permission, refAttached: false, ready: false, processing: false,
    readyCallbackReceived: false, readyGenerationMatches: false, readyCallbackGeneration: -1,
    shutterEnabled: false, shutterReason: permission ? 'starting' : 'permission',
    controlsTouch: false, pressIn: false, press: false, handlerEntered: false,
    captureInvoked: false, photoReturned: false, locationReturned: false,
    manipulationInvoked: false, manipulationReturned: false, callbackInvoked: false,
    failureBoundary: 'none',
    lastEvent: 'mounted',
  };
  const listeners = new Set<() => void>();
  const publicationFailed = (boundary?: CaptureFailureBoundary) => {
    if (boundary) snapshot = { ...snapshot, failureBoundary: boundary };
  };
  const notify = (boundary?: CaptureFailureBoundary) => {
    listeners.forEach(listener => {
      try {
        listener();
      } catch {
        publicationFailed(boundary);
      }
    });
  };
  const update = (changes: Partial<CameraDiagnosticState>, boundary?: CaptureFailureBoundary) => {
    snapshot = { ...snapshot, ...changes };
    notify(boundary);
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update,
    record: (event: DiagnosticEvent, changes: Partial<CameraDiagnosticState> = {}) => {
      const boundary: CaptureFailureBoundary | undefined = event === 'capture-returned'
        ? 'photo-return-diagnostic-error'
        : event === 'location-returned' ? 'location-return-diagnostic-error'
          : event === 'manipulation-invoked' ? 'manipulation-marker-diagnostic-error' : undefined;
      update({ ...changes, lastEvent: event }, boundary);
      if (CAMERA_DIAGNOSTICS_ENABLED) {
        try {
          console.info('Camera diagnostics', snapshot);
        } catch {
          publicationFailed(boundary);
          notify();
        }
      }
    },
  };
}

function CameraDiagnosticPanel({ diagnostics }: { diagnostics: ReturnType<typeof createCameraDiagnostics> }) {
  const state = useSyncExternalStore(diagnostics.subscribe, diagnostics.getSnapshot, diagnostics.getSnapshot);
  const yesNo = (value: boolean) => value ? 'yes' : 'no';
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 105, left: 12, right: 12, padding: 10, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.85)' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Camera diagnostics</Text>
      <Text style={{ color: '#fff', fontSize: 11, lineHeight: 16 }}>
        generation: {state.generation} · ready generation: {state.readyGeneration} · attempt: {state.attempt}{'\n'}
        permission: {yesNo(state.permission)} · ref attached: {yesNo(state.refAttached)}{'\n'}
        ready: {yesNo(state.ready)} · processing: {yesNo(state.processing)}{'\n'}
        ready callback: {yesNo(state.readyCallbackReceived)} · generation: {state.readyCallbackGeneration} · matched: {yesNo(state.readyGenerationMatches)}{'\n'}
        shutter enabled: {yesNo(state.shutterEnabled)}{'\n'}
        controls touch: {yesNo(state.controlsTouch)} · press-in: {yesNo(state.pressIn)} · press: {yesNo(state.press)}{'\n'}
        handler entered: {yesNo(state.handlerEntered)} · capture invoked: {yesNo(state.captureInvoked)}{'\n'}
        photo returned: {yesNo(state.photoReturned)} · location returned: {yesNo(state.locationReturned)}{'\n'}
        manipulation invoked: {yesNo(state.manipulationInvoked)} · returned: {yesNo(state.manipulationReturned)}{'\n'}
        callback invoked: {yesNo(state.callbackInvoked)}{'\n'}
        failure boundary: {state.failureBoundary}{'\n'}
        last event: {state.lastEvent}
      </Text>
    </View>
  );
}

export default function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [isProcessing, setIsProcessing] = useState(false);
  // Fresh on every mount. The shutter is gated on this so a reopened camera
  // cannot be triggered before the native camera signals readiness.
  const [cameraReady, setCameraReady] = useState(false);
  // Generation used as the CameraView key. Incrementing forces a full unmount
  // and remount of the native camera, discarding any wedged takePictureAsync.
  const [cameraGeneration, setCameraGeneration] = useState(0);
  // Attempt identity prevents a stale (timed-out) capture's late-resolving
  // promise from reaching onCapture after a newer attempt has begun.
  const attemptRef = useRef(0);
  // Tracks the generation that onCameraReady must match before enabling the
  // shutter. Updated synchronously when cameraGeneration changes so a late
  // callback from an obsolete CameraView can never enable the current one.
  const readyGenerationRef = useRef(0);
  const [diagnostics] = useState(() => createCameraDiagnostics(Boolean(permission?.granted)));
  const attachCameraRef = useCallback((camera: CameraView | null) => {
    cameraRef.current = camera;
    diagnostics.record(camera ? 'ref-attached' : 'ref-detached', { refAttached: camera !== null });
  }, [diagnostics]);

  useEffect(() => {
    void (async () => {
      if (!permission?.granted) await requestPermission();
    })();
  }, [permission, requestPermission]);

  const shutterState = getShutterState({
    permissionGranted: Boolean(permission?.granted),
    cameraRefAvailable: cameraRef.current !== null,
    cameraReady,
    isProcessing,
  });

  useEffect(() => {
    diagnostics.record('mounted');
    return () => diagnostics.record('unmounted');
  }, [diagnostics]);

  useEffect(() => {
    const generationChanged = diagnostics.getSnapshot().generation !== cameraGeneration;
    diagnostics.update({
      generation: cameraGeneration,
      readyGeneration: readyGenerationRef.current,
      attempt: attemptRef.current,
      permission: Boolean(permission?.granted),
      refAttached: cameraRef.current !== null,
      ready: cameraReady,
      processing: isProcessing,
      shutterEnabled: shutterState.enabled,
      shutterReason: shutterState.reason,
    });
    if (generationChanged) {
      const receivedForGeneration = diagnostics.getSnapshot().readyCallbackGeneration === cameraGeneration;
      diagnostics.record('generation-restarted', {
        readyCallbackReceived: receivedForGeneration,
        readyGenerationMatches: receivedForGeneration && readyGenerationRef.current === cameraGeneration,
      });
    }
  }, [diagnostics, cameraGeneration, cameraReady, isProcessing, permission?.granted, shutterState.enabled, shutterState.reason]);

  const takePicture = async () => {
    diagnostics.record('handler-entered', { handlerEntered: true });
    // Fail safely instead of a silent dead shutter when the camera is not ready
    // or the native ref is unavailable.
    if (!permission?.granted || cameraRef.current === null || !cameraReady) {
      diagnostics.record(!permission?.granted ? 'handler-blocked-permission'
        : cameraRef.current === null ? 'handler-blocked-ref' : 'handler-blocked-ready');
      Alert.alert('Camera starting', 'Camera is still starting. Please try again in a moment.', [{ text: 'OK' }]);
      return;
    }
    if (isProcessing) {
      diagnostics.record('handler-blocked-processing');
      return;
    }

    const attemptId = ++attemptRef.current;
    let failureBoundary: CaptureFailureBoundary = 'none';
    const recordFailureBoundary = (boundary: CaptureFailureBoundary) => {
      failureBoundary = boundary;
    };
    const recordAttempt = (event: DiagnosticEvent, changes: Partial<CameraDiagnosticState> = {}) => {
      if (attemptRef.current === attemptId) {
        diagnostics.record(event, changes);
      } else if (CAMERA_DIAGNOSTICS_ENABLED) {
        try {
          console.info('Camera diagnostics', { lastEvent: 'attempt-obsolete', generation: cameraGeneration, attempt: attemptId });
        } catch {
          return;
        }
      }
    };
    try {
      setIsProcessing(true);
      recordAttempt('processing', {
        failureBoundary: 'none',
        attempt: attemptId, captureInvoked: false, photoReturned: false, locationReturned: false,
        manipulationInvoked: false, manipulationReturned: false, callbackInvoked: false,
      });
      const camera = cameraRef.current;
      const { photo: rawPhoto, captureLocation } = await captureWithLocation(
        () => {
          recordAttempt('capture-invoked', { captureInvoked: true });
          return camera.takePictureAsync({ quality: 1 }).then(photo => {
            recordAttempt('capture-returned', { photoReturned: true });
            return photo;
          });
        },
        () => {
          recordAttempt('location-wait');
          return locationService.getCurrentLocation().then(location => {
            recordAttempt('location-returned', { locationReturned: true });
            return location;
          });
        },
        recordFailureBoundary,
      );
      if (attemptRef.current !== attemptId) {
        recordAttempt('attempt-obsolete');
        return;
      }
      validatePhotoCaptureResult(rawPhoto, recordFailureBoundary);

      recordAttempt('manipulation-invoked', { manipulationInvoked: true });
      const normalizedPhoto = await ImageManipulator.manipulateAsync(
        rawPhoto.uri,
        [{ resize: { width: 500, height: 500 } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      recordAttempt('manipulation-returned', { manipulationReturned: true });
      if (attemptRef.current !== attemptId) {
        recordAttempt('attempt-obsolete');
        return;
      }
      recordAttempt('callback-invoked', { callbackInvoked: true });
      await onCapture(normalizedPhoto.uri, captureLocation);
      recordAttempt('capture-complete', { failureBoundary: 'none' });
    } catch (captureError) {
      if (attemptRef.current !== attemptId) {
        recordAttempt('attempt-obsolete');
        return;
      }
      if (isPhotoCaptureTimeout(captureError)) {
        recordAttempt('photo-timeout', { failureBoundary: 'photo-timeout' });
        setCameraReady(false);
        setCameraGeneration(gen => {
          readyGenerationRef.current = gen + 1;
          return gen + 1;
        });
        Alert.alert(
          'Camera restarted',
          'Camera capture took too long. The camera has been restarted. Please try again.',
          [{ text: 'OK' }],
        );
        return;
      }
      recordAttempt('capture-error', {
        failureBoundary: failureBoundary === 'none' ? 'post-capture-unexpected' : failureBoundary,
      });
      const message = captureError instanceof Error && /location/i.test(captureError.message)
        ? 'Location could not be captured. Check location access and try the photo again.'
        : 'A photo and current location are required. Check camera and location permissions, then try again.';
      Alert.alert('Capture Error', message, [{ text: 'OK' }]);
    } finally {
      if (attemptRef.current === attemptId) {
        setIsProcessing(false);
      }
    }
  };

  const toggleFacing = () => {
    // Changing lens reinitializes the native camera; treat readiness
    // conservatively until onCameraReady fires again.
    setCameraReady(false);
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  if (!permission?.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'white', marginBottom: 12 }}>Camera permission is required.</Text>
        <TouchableOpacity
          onPress={requestPermission}
          style={{ backgroundColor: '#dc2626', padding: 12, borderRadius: 8 }}
        >
          <Text style={{ color: 'white', fontWeight: '600' }}>Grant Permission</Text>
        </TouchableOpacity>
        {CAMERA_DIAGNOSTICS_ENABLED && <CameraDiagnosticPanel diagnostics={diagnostics} />}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <CameraView
        key={cameraGeneration}
        ref={attachCameraRef}
        style={{ flex: 1 }}
        facing={facing}
        onCameraReady={() => {
          diagnostics.record(readyGenerationRef.current === cameraGeneration ? 'camera-ready' : 'camera-ready-ignored', {
            readyCallbackReceived: true,
            readyGenerationMatches: readyGenerationRef.current === cameraGeneration,
            readyCallbackGeneration: cameraGeneration,
          });
          if (readyGenerationRef.current === cameraGeneration) {
            setCameraReady(true);
          }
        }}
      />

      <View
        style={{
          position: 'absolute',
          top: 40,
          width: '100%',
          paddingHorizontal: 20,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <TouchableOpacity
          onPress={onCancel}
          style={{ padding: 10, borderRadius: 50, backgroundColor: 'rgba(0,0,0,0.4)' }}
        >
          <X size={22} color="white" strokeWidth={1.5} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={toggleFacing}
          style={{ padding: 10, borderRadius: 50, backgroundColor: 'rgba(0,0,0,0.4)' }}
        >
          <RotateCcw size={22} color="white" strokeWidth={1.5} />
        </TouchableOpacity>
      </View>

      <View
        onTouchStart={() => diagnostics.record('controls-touch', { controlsTouch: true })}
        style={{
          position: 'absolute',
          bottom: 40,
          width: '100%',
          alignItems: 'center',
        }}
      >
        {isProcessing && (
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.15)',
              padding: 16,
              borderRadius: 12,
              marginBottom: 16,
            }}
          >
            <ActivityIndicator size="large" color="#fff" />
            <Text style={{ color: 'white', marginTop: 8 }}>Uploading and classifying…</Text>
          </View>
        )}
        {!isProcessing && shutterState.reason === 'starting' && (
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.15)',
              padding: 16,
              borderRadius: 12,
              marginBottom: 16,
            }}
          >
            <ActivityIndicator size="large" color="#fff" />
            <Text style={{ color: 'white', marginTop: 8 }}>Starting camera…</Text>
          </View>
        )}
        {CAMERA_DIAGNOSTICS_ENABLED && <Text pointerEvents="none" style={{ color: shutterState.enabled ? '#fff' : '#facc15', fontWeight: '700', marginBottom: 8 }}>
          {shutterState.enabled ? 'SHUTTER: READY'
            : shutterState.reason === 'processing' ? 'SHUTTER: PROCESSING'
              : shutterState.reason === 'permission' ? 'SHUTTER: PERMISSION REQUIRED'
                : 'SHUTTER: WAITING FOR CAMERA'}
        </Text>}
        <TouchableOpacity
          onPressIn={() => diagnostics.record('shutter-press-in', { pressIn: true })}
          onPress={() => {
            diagnostics.record('shutter-press', { press: true });
            return takePicture();
          }}
          disabled={!shutterState.enabled}
          accessibilityState={{ disabled: !shutterState.enabled }}
          style={{
            width: 90,
            height: 90,
            borderRadius: 50,
            backgroundColor: shutterState.enabled ? 'white' : '#888',
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 5,
            borderColor: shutterState.enabled ? '#dc2626' : '#555',
          }}
        >
          <CameraIcon
            size={30}
            color={shutterState.enabled ? '#dc2626' : '#333'}
            strokeWidth={1.6}
          />
        </TouchableOpacity>
        <Text style={{ color: 'white', marginTop: 14 }}>
          {shutterState.reason === 'starting' ? 'Starting camera…' : 'Take a clear photo for server verification'}
        </Text>
      </View>
      {CAMERA_DIAGNOSTICS_ENABLED && <CameraDiagnosticPanel diagnostics={diagnostics} />}
    </View>
  );
}
