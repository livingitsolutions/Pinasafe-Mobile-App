import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Navigation, UserRound } from 'lucide-react-native';
import { apiService, isApiError, ResponderLocationSnapshot } from '@/services/apiService';
import { Banner, Button } from '@/components/ui';
import { formatLocationAge, getLocationFreshness } from '@/utils/liveTracking';
import { getEmergencyReportMapUrl } from '@/utils/mapUrl';
import { colors, radius, space, type } from '@/theme/tokens';

const POLL_MS = 10000;
const CLOCK_MS = 5000;
const NOT_AVAILABLE = 'Responder location not available yet.';

/** Command-center view of the assigned responder's latest reported position. */
export default function ResponderLocationPanel({ reportId }: { reportId: string }) {
  const [snapshot, setSnapshot] = useState<ResponderLocationSnapshot | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const response = await apiService.getResponderLocation(reportId);
      const data = response.data?.data;
      if (!mounted.current) return;
      if (!data || typeof data.tracking_active !== 'boolean') { setError('Responder location could not be loaded.'); return; }
      setSnapshot(data); setError('');
    } catch (cause) {
      if (!mounted.current) return;
      setError(isApiError(cause) && cause.status === 403 ? 'Responder location is restricted for your account.' : 'Responder location could not be loaded.');
    }
  }, [reportId]);

  useEffect(() => {
    mounted.current = true;
    void load();
    const poll = setInterval(() => { void load(); }, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => { mounted.current = false; clearInterval(poll); clearInterval(clock); };
  }, [load]);

  if (error && !snapshot) return <Banner title="Responder location" message={error} tone="warning" />;
  if (!snapshot) return <Text style={styles.caption}>Loading responder location...</Text>;
  if (snapshot.response_complete) return <Banner title="Response completed" message="This incident is resolved. Live responder tracking has ended." tone="success" />;

  const location = snapshot.location;
  if (!location) {
    return <View style={styles.panel}>
      <Text style={styles.title}>{NOT_AVAILABLE}</Text>
      <Text style={styles.caption}>{snapshot.tracking_active ? 'The team is responding but has not shared a live position.' : 'Live tracking can begin after the assigned team presses Respond.'}</Text>
    </View>;
  }

  const freshness = getLocationFreshness(location.captured_at, now);
  const mapUrl = getEmergencyReportMapUrl({ latitude: location.latitude, longitude: location.longitude });
  const stale = freshness !== 'fresh';
  return <View style={[styles.panel, stale ? styles.panelStale : styles.panelFresh]}>
    <View style={styles.row}>
      <UserRound size={18} color={colors.ink} />
      <Text style={[styles.title, { flex: 1 }]}>{[location.team_name, location.responder_name].filter(Boolean).join(' - ') || 'Assigned responder'}</Text>
      <View style={[styles.badge, { backgroundColor: stale ? colors.warningSoft : colors.successSoft }]}><Text style={[styles.badgeText, { color: stale ? colors.warning : colors.success }]}>{stale ? 'STALE' : 'LIVE'}</Text></View>
    </View>
    <Text style={styles.caption}>Last updated {new Date(location.captured_at).toLocaleTimeString()} ({formatLocationAge(location.captured_at, now)}){location.accuracy_meters !== null ? `, accuracy about ${Math.round(location.accuracy_meters)} m` : ''}</Text>
    {stale ? <Text style={[styles.caption, { color: colors.warning }]}>No update in the last 30 seconds. The responder may have stopped sharing or lost signal.</Text> : null}
    {error ? <Text style={[styles.caption, { color: colors.warning }]}>{error} Showing the last known position.</Text> : null}
    {mapUrl ? <View style={styles.actions}><Button variant="secondary" label="Show responder on map" icon={<Navigation size={18} color={colors.ink} />} onPress={() => { void Linking.openURL(mapUrl); }} /></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  panelFresh: { borderColor: colors.success },
  panelStale: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  title: { ...type.label, color: colors.ink },
  caption: { ...type.caption, color: colors.muted },
  badge: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { ...type.caption, fontFamily: type.label.fontFamily },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
