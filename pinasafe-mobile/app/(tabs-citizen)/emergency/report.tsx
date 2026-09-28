import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraIcon } from 'lucide-react-native';
import * as Location from 'expo-location';
import CameraCapture from '@/components/CameraCapture';
import { apiService, EvidenceClassification, isApiError } from '@/services/apiService';
import { acquireSubmissionLock, buildDurableReportPayload, countAcceptedEvidence, EvidenceItem, IncidentType, MAX_ACCEPTED_EVIDENCE } from '@/utils/evidenceFlow';

function ReportEmergency() {
  const [step, setStep] = useState<'form' | 'camera'>('form');
  const [type, setType] = useState<IncidentType>('road');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number }>();
  const [uploadSessionId, setUploadSessionId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [isPreparingCamera, setIsPreparingCamera] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const acceptedCount = countAcceptedEvidence(evidence);
  const hasPendingUpload = evidence.some(item => item.status === 'uploading');

  const ensureEvidenceSession = async () => {
    if (uploadSessionId) return uploadSessionId;
    const response = await apiService.createEvidenceSession();
    const sessionId = response.data?.data.id;
    if (!sessionId) throw new Error('The evidence session could not be created.');
    setUploadSessionId(sessionId);
    return sessionId;
  };

  const openCamera = async () => {
    if (acceptedCount >= MAX_ACCEPTED_EVIDENCE || isPreparingCamera) return;
    setIsPreparingCamera(true);
    try {
      await ensureEvidenceSession();
      if (!coordinates) {
        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status === 'granted') {
            const position = await Location.getCurrentPositionAsync({});
            setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
            if (!location.trim()) {
              const places = await Location.reverseGeocodeAsync(position.coords);
              const place = places[0];
              const address = place && [place.name, place.street, place.city, place.region, place.country].filter(Boolean).join(', ');
              if (address) setLocation(address);
            }
          }
        } catch { /* Location remains available as manual report-level input. */ }
      }
      setStep('camera');
    }
    catch (error) { Alert.alert('Evidence unavailable', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setIsPreparingCamera(false); }
  };

  const uploadCapture = async (uri: string) => {
    const localId = `${Date.now()}-${Math.random()}`;
    setEvidence(current => [...current, { localId, uri, status: 'uploading' }]);
    setStep('form');
    try {
      const response = await apiService.uploadEvidenceImage(await ensureEvidenceSession(), { uri });
      const result = response.data?.data;
      if (!result) throw new Error('The server returned an invalid evidence result.');
      if (result.accepted && 'classification' in result) {
        setType(result.classification.label as IncidentType);
        setEvidence(current => current.map(item => item.localId === localId ? { ...item, status: 'accepted', classification: result.classification } : item));
      } else {
        const classification = result as EvidenceClassification;
        setEvidence(current => current.map(item => item.localId === localId ? { ...item, status: 'rejected', classification, reason: classification.reason || classification.caption || 'The image was not accepted.' } : item));
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Evidence upload failed.';
      setEvidence(current => current.map(item => item.localId === localId ? { ...item, status: 'error', reason } : item));
    }
  };

  const retake = (localId: string) => { setEvidence(current => current.filter(item => item.localId !== localId)); void openCamera(); };

  const submit = async () => {
    if (isSubmitting) return;
    if (!uploadSessionId || acceptedCount < 1) return Alert.alert('Evidence required', 'Add at least one accepted evidence image.');
    if (hasPendingUpload) return Alert.alert('Upload in progress', 'Wait for evidence classification to finish.');
    if (description.trim().length < 10 || location.trim().length < 5) return Alert.alert('Missing information', 'Enter a description and location before submitting.');
    if (!acquireSubmissionLock(submissionLock)) return;
    setIsSubmitting(true);
    try {
      const response = await apiService.createEmergencyReport(buildDurableReportPayload({ type, description, location, contactNumber, coordinates, uploadSessionId }));
      if (!response.data?.data?.id) throw new Error('The report was not confirmed by the server.');
      Alert.alert('Report submitted', 'Your emergency report was created successfully.');
      setDescription(''); setLocation(''); setContactNumber(''); setCoordinates(undefined); setEvidence([]); setUploadSessionId(null);
    } catch (error) { Alert.alert('Submission failed', isApiError(error) ? error.message : 'Failed to submit the report. Please try again.'); }
    finally { submissionLock.current = false; setIsSubmitting(false); }
  };

  if (step === 'camera') return <CameraCapture onCapture={uploadCapture} onCancel={() => setStep('form')} />;
  return <SafeAreaView className="flex-1 bg-gray-50"><ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 32 }}>
    <Text className="mb-2 text-2xl font-bold text-gray-900">Report an Emergency</Text>
    <Text className="mb-5 text-gray-600">Add 1–5 live camera images, then submit the report when ready.</Text>
    <Text className="mb-2 text-base font-semibold text-gray-900">Incident type</Text>
    <View className="mb-5 flex-row gap-3">{(['road', 'fire'] as const).map(value => <TouchableOpacity key={value} onPress={() => setType(value)} className={`flex-1 rounded-xl border p-3 ${type === value ? 'border-red-600 bg-red-50' : 'border-gray-200 bg-white'}`}><Text className="text-center font-semibold capitalize text-gray-900">{value}</Text></TouchableOpacity>)}</View>
    <Text className="mb-2 text-base font-semibold text-gray-900">Description *</Text>
    <TextInput className="mb-5 rounded-xl border border-gray-200 bg-white p-4 text-gray-900" placeholder="Describe the emergency (at least 10 characters)" value={description} onChangeText={setDescription} multiline numberOfLines={4} textAlignVertical="top" />
    <Text className="mb-2 text-base font-semibold text-gray-900">Location *</Text>
    <TextInput className="mb-5 rounded-xl border border-gray-200 bg-white p-4 text-gray-900" placeholder="Incident location" value={location} onChangeText={setLocation} />
    <Text className="mb-2 text-base font-semibold text-gray-900">Contact number</Text>
    <TextInput className="mb-5 rounded-xl border border-gray-200 bg-white p-4 text-gray-900" placeholder="Optional contact number" value={contactNumber} onChangeText={setContactNumber} keyboardType="phone-pad" />
    <View className="mb-3 flex-row items-center justify-between"><Text className="text-base font-semibold text-gray-900">Evidence</Text><Text className="text-gray-600">{acceptedCount}/{MAX_ACCEPTED_EVIDENCE} accepted</Text></View>
    {evidence.map(item => <View key={item.localId} className="mb-3 flex-row rounded-xl border border-gray-200 bg-white p-3"><Image source={{ uri: item.uri }} className="h-20 w-20 rounded-lg" /><View className="ml-3 flex-1"><Text className="font-semibold capitalize text-gray-900">{item.status}</Text>{item.status === 'uploading' && <ActivityIndicator className="mt-2 self-start" color="#dc2626" />}{item.classification && <Text className="mt-1 text-sm text-gray-600">Server result: {item.classification.label}</Text>}{item.reason && <Text className="mt-1 text-sm text-red-700">{item.reason}</Text>}{(item.status === 'rejected' || item.status === 'error') && <TouchableOpacity onPress={() => retake(item.localId)} className="mt-2 self-start"><Text className="font-semibold text-red-600">Retake</Text></TouchableOpacity>}</View></View>)}
    <TouchableOpacity onPress={openCamera} disabled={acceptedCount >= MAX_ACCEPTED_EVIDENCE || isPreparingCamera} className="mb-4 flex-row items-center justify-center rounded-xl bg-red-600 py-4 disabled:opacity-50">{isPreparingCamera ? <ActivityIndicator color="white" /> : <CameraIcon size={22} color="white" />}<Text className="ml-2 text-lg font-semibold text-white">Capture Evidence</Text></TouchableOpacity>
    <TouchableOpacity onPress={submit} disabled={isSubmitting || acceptedCount < 1 || hasPendingUpload} className="items-center rounded-xl bg-gray-900 py-4 disabled:opacity-50">{isSubmitting ? <ActivityIndicator color="white" /> : <Text className="text-lg font-semibold text-white">Submit Report</Text>}</TouchableOpacity>
  </ScrollView></SafeAreaView>;
}
export default React.memo(ReportEmergency);
