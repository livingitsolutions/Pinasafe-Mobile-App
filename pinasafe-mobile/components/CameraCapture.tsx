import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Camera as CameraIcon, RotateCcw, X } from 'lucide-react-native';
import { locationService } from '@/hooks/locationService';
import { captureWithLocation, CaptureLocation } from '@/utils/evidenceFlow';

interface CameraCaptureProps {
  onCapture: (uri: string, captureLocation: CaptureLocation) => Promise<void>;
  onCancel: () => void;
}

export default function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!permission?.granted) await requestPermission();
    })();
  }, [permission, requestPermission]);

  const takePicture = async () => {
    if (!cameraRef.current || isProcessing) return;

    try {
      setIsProcessing(true);
      const camera = cameraRef.current;
      const { photo: rawPhoto, captureLocation } = await captureWithLocation(
        () => camera.takePictureAsync({ quality: 1 }),
        () => locationService.getCurrentLocation(),
      );
      if (!rawPhoto?.uri) throw new Error('Failed to capture image.');

      const normalizedPhoto = await ImageManipulator.manipulateAsync(
        rawPhoto.uri,
        [{ resize: { width: 500, height: 500 } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      await onCapture(normalizedPhoto.uri, captureLocation);
    } catch {
      Alert.alert(
        'Capture Error',
        'A photo and current location are required. Check camera and location permissions, then try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsProcessing(false);
    }
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
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing} />

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
          onPress={() => setFacing(current => current === 'back' ? 'front' : 'back')}
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
        <TouchableOpacity
          onPress={takePicture}
          disabled={isProcessing}
          style={{
            width: 90,
            height: 90,
            borderRadius: 50,
            backgroundColor: isProcessing ? '#888' : 'white',
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 5,
            borderColor: isProcessing ? '#555' : '#dc2626',
          }}
        >
          <CameraIcon
            size={30}
            color={isProcessing ? '#333' : '#dc2626'}
            strokeWidth={1.6}
          />
        </TouchableOpacity>
        <Text style={{ color: 'white', marginTop: 14 }}>
          Take a clear photo for server verification
        </Text>
      </View>
    </View>
  );
}
