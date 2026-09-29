import React, { useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Check, MapPin, RotateCcw, Send, Camera, AlertTriangle, Crosshair } from 'lucide-react-native';
import CameraCapture from '@/components/CameraCapture';
import { Banner, Button, Card, Field, Input, PageHeader, Screen, Section, TextArea, TypeBadge } from '@/components/ui';
import { apiService, isApiError } from '@/services/apiService';
import { locationService } from '@/hooks/locationService';
import {
  acquireSubmissionLock,
  buildDurableReportPayload,
  countAcceptedEvidence,
  EvidenceItem,
  IncidentType,
  MAX_ACCEPTED_EVIDENCE,
  CaptureLocation,
} from '@/utils/evidenceFlow';
import { colors, radius, space, type as typography } from '@/theme/tokens';

type Stage = 'capture' | 'verify' | 'review' | 'success';

export default function ReportEmergency() {
  const [stage, setStage] = useState<Stage>('capture');
  const [incidentType, setIncidentType] = useState<IncidentType | null>(null);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [captureLocation, setCaptureLocation] = useState<CaptureLocation | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reportId, setReportId] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'fetching' | 'denied' | 'ready'>('idle');
  const lock = useRef(false);
  const accepted = countAcceptedEvidence(evidence);
  const uploading = evidence.some(item => item.status === 'uploading');

  const ensureSession = async () => {
    if (sessionId) return sessionId;
    const response = await apiService.createEvidenceSession();
    const id = response.data?.data.id;
    if (!id) throw new Error('Evidence session could not be created.');
    setSessionId(id);
    return id;
  };

  const captureLocationAtCapture = async (): Promise<CaptureLocation | null> => {
    setLocationStatus('fetching');
    try {
      const loc = await locationService.getCurrentLocation();
      if (!loc) {
        setLocationStatus('denied');
        return null;
      }
      const captureLoc: CaptureLocation = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
        timestamp: loc.timestamp,
        address: loc.address,
      };
      setLocationStatus('ready');
      return captureLoc;
    } catch {
      setLocationStatus('denied');
      return null;
    }
  };

  const openCamera = () => {
    if (accepted >= MAX_ACCEPTED_EVIDENCE) return;
    setError('');
    setShowCamera(true);
  };

  const handleCapture = async (uri: string) => {
    setShowCamera(false);
    setBusy(true);
    setError('');

    const captureLoc = await captureLocationAtCapture();
    if (!captureLoc) {
      setError('Location is required to capture evidence. Grant location permission and try again.');
      setBusy(false);
      return;
    }

    const localId = `${Date.now()}-${Math.random()}`;
    setEvidence(items => [...items, { localId, uri, status: 'uploading', captureLocation: captureLoc }]);

    if (!location.trim() && captureLoc.address) {
      setLocation(captureLoc.address);
    }

    try {
      const sid = await ensureSession();
      const response = await apiService.uploadEvidenceImage(sid, { uri });
      const result = response.data?.data;
      if (!result) throw new Error('The server returned no classification result.');

      if (result.accepted && 'classification' in result) {
        const label = result.classification.label as IncidentType;
        setIncidentType(label);
        setEvidence(items => items.map(item => item.localId === localId
          ? { ...item, status: 'accepted', classification: result.classification }
          : item));
        setCaptureLocation(captureLoc);
        setStage('verify');
      } else {
        const classification = result as any;
        setEvidence(items => items.map(item => item.localId === localId
          ? { ...item, status: 'rejected', classification, reason: classification.reason || classification.caption || 'The image does not clearly show a supported incident.' }
          : item));
      }
    } catch (cause) {
      setEvidence(items => items.map(item => item.localId === localId
        ? { ...item, status: 'error', reason: cause instanceof Error ? cause.message : 'Upload failed.' }
        : item));
    } finally {
      setBusy(false);
    }
  };

  const retake = () => {
    setEvidence([]);
    setIncidentType(null);
    setCaptureLocation(null);
    setLocationStatus('idle');
    setStage('capture');
  };

  const submit = async () => {
    if (!sessionId || !acquireSubmissionLock(lock)) return;
    if (!incidentType || !captureLocation) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiService.createEmergencyReport(
        buildDurableReportPayload({
          type: incidentType,
          description,
          location: location.trim() || captureLocation.address || `${captureLocation.latitude.toFixed(4)}, ${captureLocation.longitude.toFixed(4)}`,
          contactNumber,
          coordinates: { latitude: captureLocation.latitude, longitude: captureLocation.longitude },
          uploadSessionId: sessionId,
        })
      );
      const id = response.data?.data?.id;
      if (!id) throw new Error('The server did not confirm the report.');
      setReportId(id);
      setStage('success');
    } catch (cause) {
      setError(isApiError(cause) ? cause.message : 'The report could not be submitted. Your details remain on this screen.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  if (showCamera) {
    return <CameraCapture onCapture={handleCapture} onCancel={() => setShowCamera(false)} />;
  }

  if (stage === 'success') {
    return (
      <Screen>
        <View style={styles.success}>
          <View style={styles.successIcon}><Check size={32} color={colors.success} /></View>
          <Text style={styles.successTitle}>Report confirmed</Text>
          <Text style={styles.successText}>Your incident was securely submitted. Follow its authoritative status from incident history.</Text>
          <Text style={styles.reference}>Reference {reportId.slice(0, 8).toUpperCase()}</Text>
          <Button label="View incident" onPress={() => router.replace(`/incident/${reportId}`)} />
          <Button variant="quiet" label="Back to emergency home" onPress={() => router.replace('/(tabs-citizen)/emergency-main')} />
        </View>
      </Screen>
    );
  }

  if (stage === 'capture') {
    return (
      <Screen>
        <PageHeader eyebrow="Step 1 of 3" title="Capture evidence" description="Take a clear photo of the incident. The server will verify and classify it automatically." />
        {error ? <Banner title="This step needs attention" message={error} tone="error" /> : null}
        {locationStatus === 'denied' ? (
          <Banner title="Location required" message="PinaSafe needs your location to report an incident. Grant location permission in your device settings and try again." tone="warning" />
        ) : null}
        <Section title="Live camera evidence" description="Evidence must come from the live camera. The AI classifier determines the incident type.">
          {evidence.length > 0 ? (
            <View style={styles.evidenceList}>
              {evidence.map(item => (
                <Card key={item.localId} style={styles.evidence}>
                  <Image accessibilityLabel="Captured incident evidence" source={{ uri: item.uri }} style={styles.image} />
                  <View style={styles.evidenceCopy}>
                    <Text style={styles.evidenceStatus}>
                      {item.status === 'uploading' ? 'Server classification in progress'
                        : item.status === 'accepted' ? `Accepted as ${item.classification?.label}`
                        : item.status === 'rejected' ? 'Image rejected'
                        : 'Upload failed'}
                    </Text>
                    {item.reason ? <Text style={styles.errorText}>{item.reason}</Text> : null}
                    {item.captureLocation ? (
                      <Text style={styles.captureLoc}>Captured at {item.captureLocation.latitude.toFixed(4)}, {item.captureLocation.longitude.toFixed(4)}</Text>
                    ) : null}
                  </View>
                </Card>
              ))}
            </View>
          ) : null}
          <Button label={accepted > 0 ? 'Capture another image' : 'Open live camera'} onPress={openCamera} disabled={accepted >= MAX_ACCEPTED_EVIDENCE} loading={busy} icon={<Camera size={19} color={colors.white} />} />
          <Text style={styles.counter}>{accepted} of {MAX_ACCEPTED_EVIDENCE} accepted</Text>
          {accepted > 0 ? (
            <Button label="Continue to verification" onPress={() => setStage('verify')} icon={<Check size={18} color={colors.white} />} />
          ) : null}
        </Section>
      </Screen>
    );
  }

  if (stage === 'verify') {
    return (
      <Screen>
        <PageHeader eyebrow="Step 2 of 3" title="Verify classification" description="Review the AI-detected incident type and capture location. You can retake the evidence if needed." />
        {error ? <Banner title="This step needs attention" message={error} tone="error" /> : null}
        <Section title="AI classification result">
          <Card tone="critical">
            <View style={styles.verifyHead}>
              {incidentType ? <TypeBadge value={incidentType} /> : null}
              <Text style={styles.verifyType}>
                {incidentType === 'fire' ? 'Fire incident detected' : incidentType === 'road' ? 'Road incident detected' : 'No classification'}
              </Text>
            </View>
            {evidence.filter(e => e.status === 'accepted').map(item => (
              <View key={item.localId} style={styles.verifyEvidence}>
                <Image accessibilityLabel="Accepted evidence" source={{ uri: item.uri }} style={styles.image} />
                <View style={styles.evidenceCopy}>
                  <Text style={styles.evidenceStatus}>Accepted as {item.classification?.label}</Text>
                  {item.classification?.confidence != null ? (
                    <Text style={styles.confidenceText}>Confidence: {Math.round(item.classification.confidence * 100)}%</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        </Section>
        <Section title="Capture location">
          <Card>
            {captureLocation ? (
              <View style={styles.locationInfo}>
                <Crosshair size={20} color={colors.brand} />
                <View style={styles.locationCopy}>
                  <Text style={styles.locationText}>{captureLocation.address || `${captureLocation.latitude.toFixed(4)}, ${captureLocation.longitude.toFixed(4)}`}</Text>
                  {captureLocation.accuracy ? <Text style={styles.accuracyText}>Accuracy: ±{Math.round(captureLocation.accuracy)}m</Text> : null}
                  <Text style={styles.timestampText}>Captured at {new Date(captureLocation.timestamp).toLocaleString()}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.mutedText}>No location data available.</Text>
            )}
          </Card>
        </Section>
        <View style={styles.actions}>
          <Button variant="secondary" label="Retake evidence" onPress={retake} icon={<RotateCcw size={17} color={colors.ink} />} />
          <Button label="Continue to review" onPress={() => setStage('review')} icon={<Check size={18} color={colors.white} />} />
        </View>
      </Screen>
    );
  }

  // stage === 'review'
  return (
    <Screen>
      <PageHeader eyebrow="Step 3 of 3" title="Review and submit" description="Add an optional description, then submit your emergency report." />
      {error ? <Banner title="This step needs attention" message={error} tone="error" /> : null}
      <Section title="Incident summary">
        <Card tone="critical">
          <View style={styles.reviewHead}>
            {incidentType ? <TypeBadge value={incidentType} /> : null}
            <Text style={styles.reviewLocation}>{location || (captureLocation ? `${captureLocation.latitude.toFixed(4)}, ${captureLocation.longitude.toFixed(4)}` : '')}</Text>
          </View>
          {captureLocation ? (
            <View style={styles.reviewLocationRow}>
              <MapPin size={16} color={colors.muted} />
              <Text style={styles.reviewCoords}>{captureLocation.latitude.toFixed(4)}, {captureLocation.longitude.toFixed(4)}</Text>
            </View>
          ) : null}
          <Text style={styles.counter}>{accepted} accepted live-camera {accepted === 1 ? 'image' : 'images'}</Text>
        </Card>
      </Section>
      <Section title="Additional context" description="Optional. Describe hazards, people involved, and what responders should know.">
        <Field label="Incident description" hint={`${description.trim().length}/1000 characters`}>
          <TextArea accessibilityLabel="Incident description" value={description} maxLength={1000} onChangeText={setDescription} placeholder="Describe hazards, people involved, and what responders should know." />
        </Field>
        <Field label="Contact number" hint="Optional; responders may use this for clarification.">
          <Input accessibilityLabel="Contact number" value={contactNumber} onChangeText={setContactNumber} keyboardType="phone-pad" placeholder="Contact number" />
        </Field>
      </Section>
      <Banner title="Ready to submit" message="PinaSafe routes the report according to backend organization policy. No response ETA is promised." tone="info" />
      <View style={styles.actions}>
        <Button variant="secondary" label="Back" onPress={() => setStage('verify')} />
        <Button label="Submit emergency report" onPress={submit} loading={busy} disabled={!incidentType || !captureLocation} icon={<Send size={18} color={colors.white} />} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: space.sm },
  progressItem: { height: 4, flex: 1, backgroundColor: colors.border, borderRadius: 2 },
  progressActive: { backgroundColor: colors.brand },
  evidenceList: { gap: space.md },
  evidence: { flexDirection: 'row', gap: space.md },
  image: { width: 112, height: 112, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  evidenceCopy: { flex: 1, gap: space.sm },
  evidenceStatus: { ...typography.heading, color: colors.ink },
  errorText: { ...typography.caption, color: colors.critical },
  captureLoc: { ...typography.caption, color: colors.muted },
  counter: { ...typography.caption, color: colors.muted, textAlign: 'center' },
  verifyHead: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center' },
  verifyType: { ...typography.heading, color: colors.ink, flex: 1 },
  verifyEvidence: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  confidenceText: { ...typography.caption, color: colors.muted },
  locationInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  locationCopy: { flex: 1, gap: 2 },
  locationText: { ...typography.body, color: colors.ink },
  accuracyText: { ...typography.caption, color: colors.muted },
  timestampText: { ...typography.caption, color: colors.muted },
  mutedText: { ...typography.body, color: colors.muted },
  reviewHead: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center' },
  reviewLocation: { ...typography.label, color: colors.ink, flex: 1 },
  reviewLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm },
  reviewCoords: { ...typography.caption, color: colors.muted },
  reviewDescription: { ...typography.body, color: colors.ink, marginVertical: space.lg },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: space.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.lg },
  success: { flex: 1, minHeight: 520, maxWidth: 560, alignSelf: 'center', justifyContent: 'center', alignItems: 'stretch', gap: space.lg },
  successIcon: { width: 64, height: 64, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 32, backgroundColor: colors.successSoft },
  successTitle: { ...typography.display, textAlign: 'center', color: colors.ink },
  successText: { ...typography.body, textAlign: 'center', color: colors.muted },
  reference: { ...typography.label, textAlign: 'center', color: colors.brand },
});
