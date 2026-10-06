import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LocateFixed, LocateOff } from 'lucide-react-native';
import { apiService, isApiError } from '@/services/apiService';
import { deviceGeolocationSource } from '@/services/liveLocationSource';
import { Banner, Button } from '@/components/ui';
import { classifyPublishError, LiveTrackingController, LiveTrackingState, LOCATION_UNAVAILABLE } from '@/utils/liveTracking';
import { colors, radius, space, type } from '@/theme/tokens';

const formatTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const STOP_MESSAGES: Record<string, string> = {
  user: 'You stopped sharing. Your command center keeps the last position, marked as delayed.',
  not_responding: 'Live tracking ended because this response is no longer active.',
  unauthorized: 'Live tracking ended because you are no longer authorized for this incident.',
};

/** Rendered only for a backend-confirmed responding report; unmounting stops the watcher. */
export default function ResponderLiveTracking({ reportId }: { reportId: string }) {
  const [state, setState] = useState<LiveTrackingState>({ phase: 'idle' });
  const controllerRef = useRef<LiveTrackingController | null>(null);

  useEffect(() => {
    const controller = new LiveTrackingController({
      source: deviceGeolocationSource,
      onChange: setState,
      publish: async fix => {
        try {
          await apiService.publishResponderLocation(reportId, {
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracy: fix.accuracy,
            captured_at: new Date(fix.timestamp).toISOString(),
          });
          return 'ok';
        } catch (cause) {
          return isApiError(cause) ? classifyPublishError(cause.status, cause.code) : 'error';
        }
      },
    });
    controllerRef.current = controller;
    setState({ phase: 'idle' });
    return () => { controller.dispose(); controllerRef.current = null; };
  }, [reportId]);

  const start = () => { void controllerRef.current?.start(); };
  const stop = () => controllerRef.current?.stop('user');

  if (state.phase === 'active') {
    return <View style={[styles.panel, styles.panelActive]}>
      <View style={styles.row}><View style={styles.liveDot} /><LocateFixed size={18} color={colors.success} /><Text style={[styles.title, { color: colors.success }]}>Live Tracking On</Text></View>
      <Text style={styles.caption}>{state.lastPublishedAt ? `Last update: ${formatTime(state.lastPublishedAt)}` : 'Waiting for the first location fix from this device...'}</Text>
      {state.publishError ? <Text style={[styles.caption, { color: colors.warning }]}>The last update could not be sent. Retrying with the next fix.</Text> : null}
      <View style={styles.actions}><Button variant="secondary" label="Stop Sharing" icon={<LocateOff size={18} color={colors.ink} />} onPress={stop} /></View>
    </View>;
  }

  if (state.phase === 'unavailable') {
    return <Banner title={LOCATION_UNAVAILABLE} message={`${state.message} You can still view the incident, open maps and resolve.`} tone="warning" action={<View style={styles.bannerAction}><Button variant="secondary" label="Try again" onPress={start} /></View>} />;
  }

  return <View style={styles.panel}>
    {state.phase === 'stopped' ? <Text style={styles.caption}>{STOP_MESSAGES[state.reason] ?? STOP_MESSAGES.user}</Text> : <Text style={styles.caption}>Share your device location with your command center while you respond. Citizens see the response team’s location, not your identity.</Text>}
    {state.phase === 'stopped' && state.reason !== 'user' ? null : <View style={styles.actions}><Button label="Start Live Tracking" loading={state.phase === 'starting'} icon={<LocateFixed size={18} color={colors.white} />} onPress={start} /></View>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, marginBottom: space.lg },
  panelActive: { borderColor: colors.success, backgroundColor: colors.successSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  liveDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.success },
  title: { ...type.label },
  caption: { ...type.caption, color: colors.muted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  bannerAction: { marginTop: space.sm, alignSelf: 'flex-start' },
});
