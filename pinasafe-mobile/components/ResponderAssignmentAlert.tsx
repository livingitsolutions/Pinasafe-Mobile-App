import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { BellRing, MapPin, Volume2, VolumeX } from 'lucide-react-native';
import { Button, Priority, TypeBadge } from '@/components/ui';
import {
  isOperationalHighAlertAudioSupported,
  OperationalHighAlertAudioController,
  type OperationalHighAlertAudioState,
} from '@/utils/operationalHighAlert';
import {
  readResponderAssignmentAudioPreference,
  saveResponderAssignmentAudioPreference,
} from '@/utils/responderAssignmentAlert';
import { getEmergencyReportMapUrl } from '@/utils/mapUrl';
import { colors, radius, space, type } from '@/theme/tokens';

export interface AssignmentAlertReport {
  id: string;
  type: string;
  priority: string;
  location: string;
  coordinates?: { latitude: number; longitude: number } | null;
  assigned_at?: string | null;
  assigned_team?: { name: string };
}

interface Props {
  reports: AssignmentAlertReport[];
  respondingId: string;
  onRespond: (reportId: string) => void;
  onView: (reportId: string) => void;
}

export default function ResponderAssignmentAlert({ reports, respondingId, onRespond, onView }: Props) {
  const audioSupported = isOperationalHighAlertAudioSupported(Platform.OS);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundState, setSoundState] = useState<OperationalHighAlertAudioState>('enabled');
  const [soundNote, setSoundNote] = useState('');
  const controllerRef = useRef<OperationalHighAlertAudioController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new OperationalHighAlertAudioController(
      Platform.OS,
      () => setSoundState('unavailable'),
      state => setSoundState(state),
    );
  }

  useEffect(() => {
    const controller = controllerRef.current;
    let enabled = true;
    try {
      enabled = readResponderAssignmentAudioPreference();
    } catch {
      setSoundNote('The sound preference could not be read; sound is on for this session.');
    }
    setSoundEnabled(enabled);
    controller?.setEnabled(enabled);
    return () => controller?.dispose();
  }, []);

  const alertIds = reports.map(report => report.id).join('|');
  useEffect(() => {
    controllerRef.current?.syncOperationalAlerts(alertIds ? alertIds.split('|') : []);
  }, [alertIds]);

  const changeSound = useCallback(async (enabled: boolean) => {
    setSoundNote('');
    setSoundEnabled(enabled);
    try {
      saveResponderAssignmentAudioPreference(enabled);
    } catch {
      setSoundNote('The sound preference could not be saved; the change applies only for this session.');
    }
    controllerRef.current?.setEnabled(enabled, false);
    if (!enabled || !audioSupported) return;
    try {
      await controllerRef.current?.activate();
    } catch {
      // The visual alert remains; the controller reports activation-required or unavailable.
    }
  }, [audioSupported]);

  if (reports.length === 0) return null;

  const soundMessage = !audioSupported
    ? 'Alert sound is unavailable on this device. The visual alert stays until you respond.'
    : !soundEnabled
      ? 'Alert sound is muted.'
      : soundState === 'activation-required'
        ? 'Your browser blocked the alert sound. Tap "Play alert sound" to allow it.'
        : soundState === 'unavailable'
          ? 'Alert sound could not play. The visual alert stays until you respond.'
          : 'Alert sound repeats until your team responds.';

  return <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.panel}>
    <View style={styles.header}>
      <BellRing size={22} color={colors.white} />
      <Text style={styles.headerText}>NEW INCIDENT ASSIGNMENT{reports.length > 1 ? ` (${reports.length})` : ''}</Text>
    </View>
    <View style={styles.body}>
      {reports.map(report => {
        const mapUrl = getEmergencyReportMapUrl(report.coordinates);
        return <View key={report.id} style={styles.item}>
          <View style={styles.badges}><TypeBadge value={report.type} /><Priority value={report.priority} /></View>
          <View style={styles.row}><MapPin size={18} color={colors.brand} /><Text style={styles.location}>{report.location || 'Location not provided'}</Text></View>
          <View style={styles.meta}>
            <Text style={styles.metaText}><Text style={styles.metaLabel}>Team </Text>{report.assigned_team?.name || 'Your team'}</Text>
            <Text style={styles.metaText}><Text style={styles.metaLabel}>Dispatched </Text>{report.assigned_at ? new Date(report.assigned_at).toLocaleString() : 'Just now'}</Text>
          </View>
          <View style={styles.actions}>
            <Button variant="secondary" label="View Incident" onPress={() => onView(report.id)} />
            {mapUrl ? <Button variant="secondary" label="Open Maps" icon={<MapPin size={18} color={colors.ink} />} onPress={() => { void Linking.openURL(mapUrl); }} /> : null}
            <Button label="Respond" loading={respondingId === report.id} disabled={Boolean(respondingId) && respondingId !== report.id} onPress={() => onRespond(report.id)} />
          </View>
        </View>;
      })}
      <View style={styles.sound}>
        <Text style={styles.soundText}>{soundNote || soundMessage}</Text>
        <View style={styles.soundActions}>
          {audioSupported && soundEnabled && soundState === 'activation-required'
            ? <Button variant="quiet" label="Play alert sound" onPress={() => { void changeSound(true); }} />
            : null}
          {audioSupported
            ? <Button
              variant="quiet"
              label={soundEnabled ? 'Mute' : 'Unmute'}
              icon={soundEnabled ? <VolumeX size={18} color={colors.ink} /> : <Volume2 size={18} color={colors.ink} />}
              onPress={() => { void changeSound(!soundEnabled); }}
            />
            : null}
        </View>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.lg, borderWidth: 2, borderColor: colors.critical, backgroundColor: colors.surface, overflow: 'hidden', marginBottom: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.critical, paddingHorizontal: space.lg, paddingVertical: space.md },
  headerText: { ...type.heading, color: colors.white, letterSpacing: 0.5 },
  body: { padding: space.lg, gap: space.lg },
  item: { gap: space.md, paddingBottom: space.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  location: { ...type.heading, color: colors.ink, flex: 1 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  metaText: { ...type.body, color: colors.ink },
  metaLabel: { ...type.label, color: colors.muted },
  actions: { flexDirection: 'column', flexWrap: 'wrap', gap: space.md, justifyContent: 'flex-end' },
  sound: { flexDirection: 'column', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  soundText: { ...type.caption, color: colors.muted, minWidth: 0 },
  soundActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
