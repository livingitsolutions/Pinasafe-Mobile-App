import React, { useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Check, MapPin, Send, Camera, Crosshair } from 'lucide-react-native';
import CameraCapture from '@/components/CameraCapture';
import { Banner, Button, Card, Field, Input, PageHeader, Screen, Section, TextArea, TypeBadge } from '@/components/ui';
import { apiService, isApiError } from '@/services/apiService';
import {
  acquireSubmissionLock,
  acceptedClassificationTransition,
  buildPrimaryClassificationRetry,
  buildDurableReportPayload,
  canSubmitEvidenceReport,
  classificationFailureTransition,
  discardFailedCapture,
  countAcceptedEvidence,
  countAcceptedSupplementaryEvidence,
  EvidenceFlowStage,
  EvidenceItem,
  EvidenceRole,
  getClassificationRecoveryContent,
  getFirstAcceptedPrimaryEvidence,
  IncidentType,
  MAX_ACCEPTED_EVIDENCE,
  MAX_SUPPLEMENTARY_EVIDENCE,
  CaptureLocation,
  getFirstAcceptedCaptureLocation,
  isValidCaptureLocation,
  parseEvidenceUploadDecision,
  retakeCaptureTransition,
  retryClassificationTransition,
} from '@/utils/evidenceFlow';
import { colors, radius, space, type as typography } from '@/theme/tokens';

type Stage = EvidenceFlowStage;

export default function ReportEmergency() {
  const [stage, setStage] = useState<Stage>('capture');
  const [incidentType, setIncidentType] = useState<IncidentType | null>(null);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reportId, setReportId] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [captureRole, setCaptureRole] = useState<EvidenceRole>('primary');
  const [classificationUnavailable, setClassificationUnavailable] = useState(false);
  const [classificationRetryAvailable, setClassificationRetryAvailable] = useState(false);
  const [failedCaptureId, setFailedCaptureId] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'fetching' | 'denied' | 'ready'>('idle');
  const lock = useRef(false);
  const accepted = countAcceptedEvidence(evidence);
  const captureLocation = getFirstAcceptedCaptureLocation(evidence);
  const uploading = evidence.some(item => item.status === 'uploading');
  const supplementaryCount = countAcceptedSupplementaryEvidence(evidence);
  const recoveryContent = getClassificationRecoveryContent(classificationUnavailable, classificationRetryAvailable);

  const ensureSession = async () => {
    if (sessionId) return sessionId;
    const response = await apiService.createEvidenceSession();
    const id = response.data?.data.id;
    if (!id) throw new Error('Evidence session could not be created.');
    setSessionId(id);
    return id;
  };

  const openCamera = (role: EvidenceRole = 'primary') => {
    if (
      busy || uploading || accepted >= MAX_ACCEPTED_EVIDENCE
      || (role === 'supplementary' && supplementaryCount >= MAX_SUPPLEMENTARY_EVIDENCE)
    ) return;
    setError('');
    setCaptureRole(role);
    setShowCamera(true);
  };

  const retakeFailedCapture = () => {
    if (!failedCaptureId) return;
    const failed = evidence.find(item => item.localId === failedCaptureId);
    if (!failed) return;
    setEvidence(items => discardFailedCapture(items, failedCaptureId));
    setFailedCaptureId(null);
    const transition = retakeCaptureTransition(failed.role);
    setStage(transition.stage);
    setCaptureRole(failed.role);
    setShowCamera(transition.showCamera);
    setClassificationUnavailable(transition.classificationUnavailable);
    setClassificationRetryAvailable(false);
    setError('');
  };

  const retryClassification = async () => {
    const failed = evidence.find(item => item.localId === failedCaptureId);
    const retry = buildPrimaryClassificationRetry(failed || null, sessionId);
    if (!retry || busy) return;

    const transition = retryClassificationTransition();
    setStage(transition.stage);
    setShowCamera(transition.showCamera);
    setClassificationUnavailable(transition.classificationUnavailable);
    setClassificationRetryAvailable(false);
    setError('');
    setBusy(true);

    try {
      const response = await apiService.uploadEvidenceImage(
        retry.uploadSessionId,
        retry.image,
        retry.captureLocation,
        retry.evidenceRole
      );
      const decision = parseEvidenceUploadDecision(response.data?.data);
      if (decision.kind === 'unavailable') {
        throw Object.assign(new Error('Evidence response was unusable.'), { code: 'INVALID_EVIDENCE_RESPONSE' });
      }

      if (decision.kind === 'accepted-primary') {
        setEvidence(items => items.map(item => item.localId === retry.localId
          ? { ...item, status: 'accepted', classification: { accepted: true, ...decision.classification }, reason: undefined }
          : item));
        setIncidentType(current => current ?? decision.classification.label as IncidentType);
        if (accepted === 0 && retry.captureLocation.address) setLocation(retry.captureLocation.address);
        setFailedCaptureId(null);
        setStage(acceptedClassificationTransition().stage);
      } else if (decision.kind === 'rejected-primary') {
        setEvidence(items => items.map(item => item.localId === retry.localId
          ? { ...item, status: 'rejected', classification: decision.classification, reason: decision.classification.reason || decision.classification.caption || 'The image does not clearly show a supported incident.' }
          : item));
        setFailedCaptureId(retry.localId);
        setClassificationUnavailable(false);
        setClassificationRetryAvailable(false);
      } else {
        throw Object.assign(new Error('Unexpected evidence role in classifier response.'), { code: 'INVALID_EVIDENCE_RESPONSE' });
      }
    } catch (cause) {
      const classifierUnavailable = (isApiError(cause)
        && cause.status === 503
        && cause.message === 'Classification service unavailable');
      setFailedCaptureId(retry.localId);
      setClassificationUnavailable(classifierUnavailable);
      setClassificationRetryAvailable(classifierUnavailable);
      if (!classifierUnavailable) setError('Classification retry failed. Retake the photo before continuing.');
    } finally {
      setBusy(false);
    }
  };

  const handleCapture = async (uri: string, captureLoc: CaptureLocation) => {
    setShowCamera(false);
    setBusy(true);
    setError('');
    setClassificationUnavailable(false);
    setClassificationRetryAvailable(false);
    setFailedCaptureId(null);

    if (!isValidCaptureLocation(captureLoc)) {
      setLocationStatus('denied');
      setError('Location is required to capture evidence. Grant location permission and try again.');
      setBusy(false);
      return;
    }
    setLocationStatus('ready');

    const localId = `${Date.now()}-${Math.random()}`;
    setEvidence(items => [...items, { localId, uri, role: captureRole, status: 'uploading', captureLocation: captureLoc }]);

    try {
      const sid = await ensureSession();
      const response = await apiService.uploadEvidenceImage(sid, { uri }, captureLoc, captureRole);
      const decision = parseEvidenceUploadDecision(response.data?.data);
      if (decision.kind === 'unavailable') {
        throw Object.assign(new Error('The evidence response was unusable.'), { code: 'INVALID_EVIDENCE_RESPONSE' });
      }

      if (decision.kind === 'accepted-supplementary' && captureRole === 'supplementary') {
        setEvidence(items => items.map(item => item.localId === localId
          ? { ...item, status: 'accepted', reason: undefined }
          : item));
        setStage('supplementary');
      } else if (decision.kind === 'accepted-primary' && captureRole === 'primary') {
        const label = decision.classification.label as IncidentType;
        setIncidentType(current => current ?? label);
        if (accepted === 0 && captureLoc.address) setLocation(captureLoc.address);
        setEvidence(items => items.map(item => item.localId === localId
          ? { ...item, status: 'accepted', classification: { accepted: true, ...decision.classification }, reason: undefined }
          : item));
        setStage(acceptedClassificationTransition().stage);
      } else if (decision.kind === 'rejected-primary') {
        if (captureRole !== 'primary') {
          throw Object.assign(new Error('Unexpected supplementary classification response.'), { code: 'INVALID_EVIDENCE_RESPONSE' });
        }
        const classification = decision.classification;
        setEvidence(items => items.map(item => item.localId === localId
          ? { ...item, status: 'rejected', classification, reason: classification.reason || classification.caption || 'The image does not clearly show a supported incident.' }
          : item));
        setFailedCaptureId(localId);
        setStage('capture');
      } else {
        throw Object.assign(new Error('Unexpected evidence response.'), { code: 'INVALID_EVIDENCE_RESPONSE' });
      }
    } catch (cause) {
      const classifierUnavailable = isApiError(cause)
        && cause.status === 503
        && cause.message === 'Classification service unavailable';
      const transition = captureRole === 'primary'
        ? classificationFailureTransition()
        : { stage: 'supplementary' as const, showCamera: false, classificationUnavailable: false };
      setEvidence(items => items.map(item => item.localId === localId
        ? { ...item, status: 'error', reason: 'This photo was not accepted.' }
        : item));
      setFailedCaptureId(localId);
      setStage(transition.stage);
      setShowCamera(transition.showCamera);
      setClassificationUnavailable(captureRole === 'primary' && classifierUnavailable);
      setClassificationRetryAvailable(captureRole === 'primary' && classifierUnavailable);
      if (!classifierUnavailable) setError('This photo could not be uploaded. Retake it before continuing.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const primary = getFirstAcceptedPrimaryEvidence(evidence);
    if (!canSubmitEvidenceReport(evidence, sessionId, incidentType)
      || !primary
      || !isValidCaptureLocation(primary.captureLocation)
      || !incidentType
      || !sessionId
      || !acquireSubmissionLock(lock)) return;
    const primaryLocation = primary.captureLocation;
    const submittedType = incidentType;
    const submittedSessionId = sessionId;
    setBusy(true);
    setError('');
    try {
      const response = await apiService.createEmergencyReport(
        buildDurableReportPayload({
          type: submittedType,
          description,
          location: location.trim() || primaryLocation.address || `${primaryLocation.latitude.toFixed(4)}, ${primaryLocation.longitude.toFixed(4)}`,
          contactNumber,
          coordinates: { latitude: primaryLocation.latitude, longitude: primaryLocation.longitude },
          uploadSessionId: submittedSessionId,
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
        <PageHeader eyebrow="Step 1 of 5" title="Capture primary evidence" description="Take one live-camera photo. The server will verify and classify it automatically." />
        {recoveryContent ? (
          <Banner title={recoveryContent.title} message={recoveryContent.message} tone="error" />
        ) : null}
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
                      {item.status === 'uploading' ? (item.role === 'primary' ? 'AI classification in progress' : 'Saving supplementary evidence')
                        : item.status === 'accepted' ? `Accepted as ${item.classification?.label}`
                        : item.status === 'rejected' ? 'Primary image rejected'
                        : 'Photo not accepted'}
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
          {recoveryContent ? (
            <View style={styles.actions}>
              {recoveryContent.retryLabel ? (
                <Button variant="secondary" label={recoveryContent.retryLabel} onPress={retryClassification} disabled={busy} loading={busy} />
              ) : null}
              <Button label="Retake Photo" onPress={retakeFailedCapture} disabled={busy} icon={<Camera size={19} color={colors.white} />} />
            </View>
          ) : failedCaptureId ? (
            <Button label="Retake Photo" onPress={retakeFailedCapture} disabled={busy} loading={busy} icon={<Camera size={19} color={colors.white} />} />
          ) : (
            <Button label="Capture Primary Evidence" onPress={() => openCamera('primary')} disabled={accepted >= MAX_ACCEPTED_EVIDENCE} loading={busy} icon={<Camera size={19} color={colors.white} />} />
          )}
          <Text style={styles.counter}>{accepted} of {MAX_ACCEPTED_EVIDENCE} accepted</Text>
          {accepted > 0 ? (
            <Button label="Continue to classification result" onPress={() => setStage('verify')} icon={<Check size={18} color={colors.white} />} />
          ) : null}
        </Section>
      </Screen>
    );
  }

  if (stage === 'verify') {
    return (
      <Screen>
        <PageHeader eyebrow="Step 3 of 5" title="Classification result" description="Review the authoritative incident type and primary capture location." />
        {error ? <Banner title="This step needs attention" message={error} tone="error" /> : null}
        <Section title="AI classification result">
          <Card tone="critical">
            <View style={styles.verifyHead}>
              {incidentType ? <TypeBadge value={incidentType} /> : null}
              <Text style={styles.verifyType}>
                {incidentType === 'fire' ? 'Fire Incident Detected' : incidentType === 'road' ? 'Road Incident Detected' : 'No classification'}
              </Text>
            </View>
            <Text style={styles.evidenceStatus}>Primary evidence accepted.</Text>
            {evidence.filter(e => e.role === 'primary' && e.status === 'accepted').map(item => (
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
                  <Text style={styles.timestampText}>Captured at {new Date(captureLocation.capturedAt).toLocaleString()}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.mutedText}>No location data available.</Text>
            )}
          </Card>
        </Section>
        <View style={styles.actions}>
          <Button variant="secondary" label="Add Evidence" onPress={() => setStage('supplementary')} disabled={accepted >= MAX_ACCEPTED_EVIDENCE} icon={<Camera size={18} color={colors.ink} />} />
          <Button label="Continue" onPress={() => setStage('review')} icon={<Check size={18} color={colors.white} />} />
        </View>
      </Screen>
    );
  }

  if (stage === 'supplementary') {
    return (
      <Screen>
        <PageHeader eyebrow="Step 4 of 5" title="Optional additional evidence" description="Additional evidence is optional. Add up to 4 more photos to help responders understand the incident." />
        {error ? <Banner title="This step needs attention" message={error} tone="error" /> : null}
        <Section title="Supplementary evidence">
          {evidence.filter(item => item.role === 'supplementary').map(item => (
            <Card key={item.localId} style={styles.evidence}>
              <Image accessibilityLabel="Supplementary incident evidence" source={{ uri: item.uri }} style={styles.image} />
              <View style={styles.evidenceCopy}>
                <Text style={styles.evidenceStatus}>{item.status === 'accepted' ? 'Supplementary evidence accepted' : item.status === 'uploading' ? 'Saving supplementary evidence' : 'Photo not accepted'}</Text>
                {item.reason ? <Text style={styles.errorText}>{item.reason}</Text> : null}
                <Text style={styles.captureLoc}>Captured at {item.captureLocation.latitude.toFixed(4)}, {item.captureLocation.longitude.toFixed(4)}</Text>
              </View>
            </Card>
          ))}
          {failedCaptureId ? (
            <Button variant="secondary" label="Retake Photo" onPress={retakeFailedCapture} disabled={busy} loading={busy} icon={<Camera size={18} color={colors.ink} />} />
          ) : (
            <Button label="Add Evidence" onPress={() => openCamera('supplementary')} disabled={busy || uploading || accepted >= MAX_ACCEPTED_EVIDENCE || supplementaryCount >= MAX_SUPPLEMENTARY_EVIDENCE} loading={busy} icon={<Camera size={18} color={colors.white} />} />
          )}
          <Text style={styles.counter}>{accepted} / {MAX_ACCEPTED_EVIDENCE}</Text>
        </Section>
        <View style={styles.actions}>
          <Button variant="secondary" label="Back" onPress={() => setStage('verify')} />
          <Button label="Continue" onPress={() => setStage('review')} disabled={uploading || Boolean(failedCaptureId)} icon={<Check size={18} color={colors.white} />} />
        </View>
      </Screen>
    );
  }

  // stage === 'review'
  return (
    <Screen>
      <PageHeader eyebrow="Step 5 of 5" title="Review and submit" description="Add an optional description, then submit your emergency report." />
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
          <Text style={styles.counter}>{accepted} / {MAX_ACCEPTED_EVIDENCE} accepted evidence items</Text>
        </Card>
        {evidence.filter(item => item.role === 'supplementary' && item.status === 'accepted').map(item => (
          <Card key={item.localId} style={styles.evidence}>
            <Image accessibilityLabel="Supplementary incident evidence" source={{ uri: item.uri }} style={styles.image} />
            <View style={styles.evidenceCopy}>
              <Text style={styles.evidenceStatus}>Supplementary evidence</Text>
              <Text style={styles.captureLoc}>Captured at {item.captureLocation.latitude.toFixed(4)}, {item.captureLocation.longitude.toFixed(4)}</Text>
              <Text style={styles.timestampText}>Captured at {new Date(item.captureLocation.capturedAt).toLocaleString()}</Text>
            </View>
          </Card>
        ))}
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
        <Button label="Submit emergency report" onPress={submit} loading={busy} disabled={!canSubmitEvidenceReport(evidence, sessionId, incidentType)} icon={<Send size={18} color={colors.white} />} />
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
