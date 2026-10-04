import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Camera as CameraIcon, RotateCcw, X } from 'lucide-react-native';
import { locationService } from '@/hooks/locationService';
import {
  captureWithLocation,
  CaptureLocation,
  getShutterState,
  isPhotoCaptureTimeout,
} from '@/utils/evidenceFlow';

interface CameraCaptureProps {
  onCapture: (uri: string, captureLocation: CaptureLocation) => Promise<void>;
  onCancel: () => void;
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

  const takePicture = async () => {
    // Fail safely instead of a silent dead shutter when the camera is not ready
    // or the native ref is unavailable.
    if (!permission?.granted || cameraRef.current === null || !cameraReady) {
      Alert.alert('Camera starting', 'Camera is still starting. Please try again in a moment.', [{ text: 'OK' }]);
      return;
    }
    if (isProcessing) return;

    const attemptId = ++attemptRef.current;
    try {
      setIsProcessing(true);
      const camera = cameraRef.current;
      const { photo: rawPhoto, captureLocation } = await captureWithLocation(
        () => camera.takePictureAsync({ quality: 1 }),
        () => locationService.getCurrentLocation(),
      );
      if (attemptRef.current !== attemptId) return;
      if (!rawPhoto?.uri) throw new Error('Failed to capture image.');

      const normalizedPhoto = await ImageManipulator.manipulateAsync(
        rawPhoto.uri,
        [{ resize: { width: 500, height: 500 } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      if (attemptRef.current !== attemptId) return;
      await onCapture(normalizedPhoto.uri, captureLocation);
    } catch (captureError) {
      if (attemptRef.current !== attemptId) return;
      if (isPhotoCaptureTimeout(captureError)) {
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
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <CameraView
        key={cameraGeneration}
        ref={cameraRef}
        style={{ flex: 1 }}
        facing={facing}
        onCameraReady={() => {
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
        <TouchableOpacity
          onPress={takePicture}
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
    </View>
  );
}
