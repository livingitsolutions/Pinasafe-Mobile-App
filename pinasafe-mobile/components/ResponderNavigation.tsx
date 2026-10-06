import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Navigation } from 'lucide-react-native';
import { apiService, isApiError, ResponderNavigationSnapshot } from '@/services/apiService';
import { Banner, Button } from '@/components/ui';
import RouteMap from '@/components/RouteMap';
import { formatLocationAge, getLocationFreshness } from '@/utils/liveTracking';
import { buildNavigationUrl, ETA_UNAVAILABLE, formatDistance, formatEta, isRoutePoint, NAVIGATION_POLL_MS, ROUTE_STATUS_UNAVAILABLE, toRoutePoints } from '@/utils/responseRoute';
import { colors, radius, space, type } from '@/theme/tokens';

const CLOCK_MS = 5000;

/** Responder route, travel estimate and external turn-by-turn hand-off for one responding assignment. */
export default function ResponderNavigation({ reportId }: { reportId: string }) {
  const [snapshot, setSnapshot] = useState<ResponderNavigationSnapshot | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const done = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await apiService.getResponderNavigation(reportId);
      const data = response.data?.data;
      if (done.current) return;
      if (!data || typeof data.tracking_active !== 'boolean') { setError('Navigation could not be loaded.'); return; }
      setSnapshot(data); setError('');
      if (data.response_complete) done.current = true;
    } catch (cause) {
      if (done.current) return;
      if (isApiError(cause) && (cause.status === 403 || cause.status === 404)) done.current = true;
      setError('Navigation could not be loaded.');
    }
  }, [reportId]);

  useEffect(() => {
    done.current = false;
    void load();
    const poll = setInterval(() => { if (!done.current) void load(); }, NAVIGATION_POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => { done.current = true; clearInterval(poll); clearInterval(clock); };
  }, [load]);

  if (!snapshot) return error ? <Banner title="Navigation" message={error} tone="warning" /> : <Text style={styles.caption}>Loading route...</Text>;
  if (snapshot.response_complete) return <Banner title="Response completed" message="This incident is resolved. Navigation has ended." tone="success" />;

  const destination = isRoutePoint(snapshot.destination) ? snapshot.destination : null;
  const position = isRoutePoint(snapshot.responder_location) ? snapshot.responder_location : null;
  const navigationUrl = buildNavigationUrl(destination, Platform.OS);
  const stale = position ? getLocationFreshness(position.captured_at, now) !== 'fresh' : false;
  const routeAvailable = snapshot.route_status === 'available';
  const eta = routeAvailable ? formatEta(snapshot.duration_seconds) : null;
  const distance = routeAvailable ? formatDistance(snapshot.distance_meters) : null;

  return <View style={[styles.panel, stale ? styles.stale : null]}>
    {!destination ? <Banner title="Incident location unavailable" message="This incident has no usable coordinates, so no route can be calculated." tone="warning" /> : null}
    {destination && !position ? <Text style={styles.caption}>{snapshot.tracking_active ? 'Waiting for your live location. Start Live Tracking on the Dispatch tab to calculate the route.' : 'Route calculation starts after you press Respond.'}</Text> : null}
    {position || destination ? <RouteMap team={position} destination={destination} route={routeAvailable ? toRoutePoints(snapshot.route) : []} stale={stale} teamLabel="You" destinationLabel="Incident" /> : null}
    {position ? <View style={styles.metrics}>
      <View style={styles.metric}>
        <Text style={styles.metricLabel}>{stale ? 'Estimated arrival (location stale)' : 'Estimated arrival'}</Text>
        <Text style={styles.metricValue}>{eta ?? ETA_UNAVAILABLE}</Text>
      </View>
      <View style={styles.metric}>
        <Text style={styles.metricLabel}>Distance</Text>
        <Text style={styles.metricValue}>{distance ?? ROUTE_STATUS_UNAVAILABLE}</Text>
      </View>
    </View> : null}
    {position ? <Text style={[styles.caption, stale ? { color: colors.warning } : null]}>
      {stale ? 'Location stale. ' : ''}Last updated {new Date(position.captured_at).toLocaleTimeString()} ({formatLocationAge(position.captured_at, now)})
    </Text> : null}
    {error ? <Text style={[styles.caption, { color: colors.warning }]}>{error} Showing the last update.</Text> : null}
    {navigationUrl ? <View style={styles.actions}>
      <Button label="Navigate" icon={<Navigation size={18} color={colors.white} />} onPress={() => { void Linking.openURL(navigationUrl); }} />
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: space.sm },
  stale: { padding: space.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  caption: { ...type.caption, color: colors.muted },
  metrics: { flexDirection: 'row', gap: space.md },
  metric: { flex: 1, padding: space.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, gap: 2 },
  metricLabel: { ...type.caption, color: colors.muted },
  metricValue: { ...type.title, color: colors.ink },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
