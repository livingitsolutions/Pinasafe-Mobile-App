import React, { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Camera, Check, MapPin, RotateCcw, Send } from 'lucide-react-native';
import CameraCapture from '@/components/CameraCapture';
import { Banner, Button, Card, Field, Input, PageHeader, Screen, Section, TextArea, TypeBadge } from '@/components/ui';
import { apiService, EvidenceClassification, isApiError } from '@/services/apiService';
import { acquireSubmissionLock, buildDurableReportPayload, countAcceptedEvidence, EvidenceItem, IncidentType, MAX_ACCEPTED_EVIDENCE } from '@/utils/evidenceFlow';
import { colors, radius, space, type as typography } from '@/theme/tokens';

type Stage = 'details' | 'location' | 'evidence' | 'review' | 'success' | 'camera';
const stages = ['details', 'location', 'evidence', 'review'] as const;

export default function ReportEmergency() {
  const [stage, setStage] = useState<Stage>('details');
  const [incidentType, setIncidentType] = useState<IncidentType>('road');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number }>();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reportId, setReportId] = useState('');
  const lock = useRef(false);
  const accepted = countAcceptedEvidence(evidence);
  const uploading = evidence.some(item => item.status === 'uploading');

  const ensureSession = async () => {
    if (sessionId) return sessionId;
    const response = await apiService.createEvidenceSession();
    const id = response.data?.data.id;
    if (!id) throw new Error('Evidence session could not be created.');
    setSessionId(id); return id;
  };

  const locate = async () => {
    setBusy(true); setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') { setError('Location permission was denied. Enter the incident location manually; coordinates remain unavailable.'); return; }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      const places = await Location.reverseGeocodeAsync(position.coords);
      const place = places[0];
      if (place && !location.trim()) setLocation([place.name, place.street, place.city, place.region].filter(Boolean).join(', '));
    } catch { setError('Your location could not be determined. Enter the incident location manually.'); }
    finally { setBusy(false); }
  };

  const openCamera = async () => {
    if (accepted >= MAX_ACCEPTED_EVIDENCE) return;
    setBusy(true); setError('');
    try { await ensureSession(); setStage('camera'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Camera evidence is unavailable.'); }
    finally { setBusy(false); }
  };

  const upload = async (uri: string) => {
    const localId = `${Date.now()}-${Math.random()}`;
    setEvidence(items => [...items, { localId, uri, status: 'uploading' }]); setStage('evidence');
    try {
      const response = await apiService.uploadEvidenceImage(await ensureSession(), { uri });
      const result = response.data?.data;
      if (!result) throw new Error('The server returned no classification result.');
      if (result.accepted && 'classification' in result) {
        setIncidentType(result.classification.label as IncidentType);
        setEvidence(items => items.map(item => item.localId === localId ? { ...item, status: 'accepted', classification: result.classification } : item));
      } else {
        const classification = result as EvidenceClassification;
        setEvidence(items => items.map(item => item.localId === localId ? { ...item, status: 'rejected', classification, reason: classification.reason || classification.caption || 'The image does not clearly show a supported incident.' } : item));
      }
    } catch (cause) { setEvidence(items => items.map(item => item.localId === localId ? { ...item, status: 'error', reason: cause instanceof Error ? cause.message : 'Upload failed.' } : item)); }
  };

  const submit = async () => {
    if (!sessionId || !acquireSubmissionLock(lock)) return;
    setBusy(true); setError('');
    try {
      const response = await apiService.createEmergencyReport(buildDurableReportPayload({ type: incidentType, description, location, contactNumber, coordinates, uploadSessionId: sessionId }));
      const id = response.data?.data?.id;
      if (!id) throw new Error('The server did not confirm the report.');
      setReportId(id); setStage('success');
    } catch (cause) { setError(isApiError(cause) ? cause.message : 'The report could not be submitted. Your details remain on this screen.'); }
    finally { lock.current = false; setBusy(false); }
  };

  if (stage === 'camera') return <CameraCapture onCapture={upload} onCancel={() => setStage('evidence')} />;
  if (stage === 'success') return <Screen><View style={styles.success}><View style={styles.successIcon}><Check size={32} color={colors.success} /></View><Text style={styles.successTitle}>Report confirmed</Text><Text style={styles.successText}>Your incident was securely submitted. Follow its authoritative status from incident history.</Text><Text style={styles.reference}>Reference {reportId.slice(0, 8).toUpperCase()}</Text><Button label="View incident" onPress={() => router.replace(`/incident/${reportId}`)} /><Button variant="quiet" label="Back to emergency home" onPress={() => router.replace('/(tabs-citizen)/emergency-main')} /></View></Screen>;

  const index = stages.indexOf(stage as typeof stages[number]);
  const canContinue = stage === 'details' ? description.trim().length >= 10 : stage === 'location' ? location.trim().length >= 5 : stage === 'evidence' ? accepted > 0 && !uploading : true;
  return <Screen>
    <PageHeader eyebrow={`Step ${index + 1} of ${stages.length}`} title="Report an emergency" description="Only submit when it is safe to do so. Evidence must come from the live camera." />
    <View accessibilityLabel={`Report progress, step ${index + 1} of ${stages.length}`} style={styles.progress}>{stages.map((item, i) => <View key={item} style={[styles.progressItem, i <= index && styles.progressActive]} />)}</View>
    {error ? <Banner title="This step needs attention" message={error} tone="error" /> : null}
    {stage === 'details' ? <Section title="What is happening?" description="Choose the closest supported incident type and describe what you can see."><View style={styles.types}>{(['road', 'fire'] as const).map(value => <Pressable accessibilityRole="radio" accessibilityState={{ checked: incidentType === value }} key={value} onPress={() => setIncidentType(value)} style={[styles.typeChoice, incidentType === value && styles.typeChoiceActive]}><TypeBadge value={value} /><Text style={styles.typeHelp}>{value === 'fire' ? 'Visible fire, smoke, or burning structure' : 'Crash, obstruction, or road emergency'}</Text></Pressable>)}</View><Field label="Incident description" hint={`${description.trim().length}/1000 characters`}><TextArea accessibilityLabel="Incident description" value={description} maxLength={1000} onChangeText={setDescription} placeholder="Describe hazards, people involved, and what responders should know." /></Field></Section> : null}
    {stage === 'location' ? <Section title="Where is the incident?" description="Use your location when available, then verify the written location."><Button variant="secondary" label={coordinates ? 'Coordinates captured' : 'Use current location'} onPress={locate} loading={busy} icon={<MapPin size={18} color={colors.ink} />} /><Field label="Incident location"><Input accessibilityLabel="Incident location" value={location} onChangeText={setLocation} placeholder="Street, landmark, barangay, or area" /></Field><Field label="Contact number" hint="Optional; responders may use this for clarification."><Input accessibilityLabel="Contact number" value={contactNumber} onChangeText={setContactNumber} keyboardType="phone-pad" placeholder="Contact number" /></Field>{coordinates ? <Banner title="Precise coordinates attached" message="Coordinates came from this device and are sent only with this report." tone="success" /> : <Banner title="No coordinates attached" message="The written location is accepted. PinaSafe does not invent fallback coordinates." tone="warning" />}</Section> : null}
    {stage === 'evidence' ? <Section title="Live evidence" description="The server checks each photo. Rejected images are not attached to the report.">{evidence.map(item => <Card key={item.localId} style={styles.evidence}><Image accessibilityLabel="Captured incident evidence" source={{ uri: item.uri }} style={styles.image} /><View style={styles.evidenceCopy}><Text style={styles.evidenceStatus}>{item.status === 'uploading' ? 'Server classification in progress' : item.status === 'accepted' ? `Accepted as ${item.classification?.label}` : item.status === 'rejected' ? 'Image rejected' : 'Upload failed'}</Text>{item.reason ? <Text style={styles.errorText}>{item.reason}</Text> : null}{item.status === 'rejected' || item.status === 'error' ? <Button variant="secondary" label="Retake image" icon={<RotateCcw size={17} color={colors.ink} />} onPress={() => { setEvidence(items => items.filter(e => e.localId !== item.localId)); void openCamera(); }} /> : null}</View></Card>)}<Button label={accepted ? 'Capture another image' : 'Open live camera'} onPress={openCamera} disabled={accepted >= MAX_ACCEPTED_EVIDENCE} loading={busy} icon={<Camera size={19} color={colors.white} />} /><Text style={styles.counter}>{accepted} of {MAX_ACCEPTED_EVIDENCE} accepted</Text></Section> : null}
    {stage === 'review' ? <Section title="Review before submitting" description="Submission is explicit and separate from evidence upload."><Card tone="critical"><View style={styles.reviewHead}><TypeBadge value={incidentType} /><Text style={styles.reviewLocation}>{location}</Text></View><Text style={styles.reviewDescription}>{description}</Text><Text style={styles.counter}>{accepted} accepted live-camera {accepted === 1 ? 'image' : 'images'} · {coordinates ? 'coordinates attached' : 'written location only'}</Text></Card><Banner title="Ready to submit" message="PinaSafe routes the report according to backend organization policy. No response ETA is promised." tone="info" /></Section> : null}
    <View style={styles.actions}>{index > 0 ? <Button variant="secondary" label="Back" onPress={() => setStage(stages[index - 1])} /> : null}{stage === 'review' ? <Button label="Submit emergency report" onPress={submit} loading={busy} icon={<Send size={18} color={colors.white} />} /> : <Button label="Continue" disabled={!canContinue} onPress={() => setStage(stages[index + 1])} />}</View>
  </Screen>;
}

const styles = StyleSheet.create({ progress: { flexDirection: 'row', gap: space.sm }, progressItem: { height: 4, flex: 1, backgroundColor: colors.border, borderRadius: 2 }, progressActive: { backgroundColor: colors.brand }, types: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md }, typeChoice: { flex: 1, minWidth: 220, padding: space.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, gap: space.md }, typeChoiceActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft }, typeHelp: { ...typography.body, color: colors.muted }, evidence: { flexDirection: 'row', gap: space.md }, image: { width: 112, height: 112, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }, evidenceCopy: { flex: 1, gap: space.sm }, evidenceStatus: { ...typography.heading, color: colors.ink }, errorText: { ...typography.caption, color: colors.critical }, counter: { ...typography.caption, color: colors.muted, textAlign: 'center' }, reviewHead: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center' }, reviewLocation: { ...typography.label, color: colors.ink, flex: 1 }, reviewDescription: { ...typography.body, color: colors.ink, marginVertical: space.lg }, actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: space.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.lg }, success: { flex: 1, minHeight: 520, maxWidth: 560, alignSelf: 'center', justifyContent: 'center', alignItems: 'stretch', gap: space.lg }, successIcon: { width: 64, height: 64, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 32, backgroundColor: colors.successSoft }, successTitle: { ...typography.display, textAlign: 'center', color: colors.ink }, successText: { ...typography.body, textAlign: 'center', color: colors.muted }, reference: { ...typography.label, textAlign: 'center', color: colors.brand } });
