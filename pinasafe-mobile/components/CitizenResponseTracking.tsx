import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { apiService, CitizenResponseTracking as CitizenResponseSnapshot } from '@/services/apiService';
import RouteMap from '@/components/RouteMap';
import { Banner, Button } from '@/components/ui';
import { formatLocationAge } from '@/utils/liveTracking';
import { describeCitizenResponse, describeCitizenTeam, ETA_UNAVAILABLE, formatDistance, formatEta, isRoutePoint, NAVIGATION_POLL_MS, toRoutePoints } from '@/utils/responseRoute';
import { colors, radius, space, type } from '@/theme/tokens';

const CLOCK_MS = 5000;

/** Citizen view of the response team heading to their own report. Never shows responder identity. */
export default function CitizenResponseTracking({ reportId }: { reportId: string }) {
  const [snapshot, setSnapshot] = useState<CitizenResponseSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const done = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await apiService.getCitizenResponseTracking(reportId);
      const data = response.data?.data;
      if (done.current) return;
      if (!data || typeof data.tracking_active !== 'boolean') { setFailed(true); return; }
      setSnapshot(data);
      setFailed(false);
      if (data.response_complete) done.current = true;
    } catch {
      if (!done.current) setFailed(true);
    }
  }, [reportId]);

  useEffect(() => {
    done.current = false;
    void load();
    const poll = setInterval(() => { if (!done.current) void load(); }, NAVIGATION_POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => { done.current = true; clearInterval(poll); clearInterval(clock); };
  }, [load]);

  if (!snapshot) {
    return failed ? <Banner title="Response status unavailable" message="We couldn’t load your response status. Check your connection and try again." tone="warning" action={<Button variant="secondary" label="Try again" onPress={() => { void load(); }} />} /> : <Text style={styles.caption}>Checking response status...</Text>;
  }

  const view = describeCitizenResponse(snapshot, now);
  const assignedTeam = describeCitizenTeam(snapshot);
  const team = isRoutePoint(snapshot.responder_location) ? snapshot.responder_location : null;
  const destination = isRoutePoint(snapshot.incident_location) ? snapshot.incident_location : null;
  const eta = view.routeAvailable ? formatEta(snapshot.duration_seconds) : null;
  const distance = view.routeAvailable ? formatDistance(snapshot.distance_meters) : null;
  const stale = view.state === 'stale';
  const live = view.state === 'live';
  const enRoute = live || stale;

  return <View style={[styles.panel, view.state === 'completed' ? styles.completed : stale ? styles.stale : enRoute ? styles.live : null]}>
    {enRoute ? <Text style={styles.kicker}>HELP IS ON THE WAY</Text> : null}
    <View style={styles.row}>
      <Text style={[styles.title, { flex: 1 }]}>{view.title}</Text>
      {enRoute ? <View style={[styles.badge, { backgroundColor: stale ? colors.warningSoft : colors.successSoft }]}>
        <Text style={[styles.badgeText, { color: stale ? colors.warning : colors.success }]}>{stale ? 'STALE' : 'LIVE'}</Text>
      </View> : null}
    </View>
    <Text style={[styles.caption, stale ? { color: colors.warning } : null]}>{view.message}</Text>

    {assignedTeam ? <View style={styles.teamCard}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.metricLabel}>Assigned Response Team</Text>
        <Text style={styles.teamName}>{assignedTeam.name}</Text>
      </View>
      {assignedTeam.lifecycle ? <View style={[styles.badge, { backgroundColor: assignedTeam.lifecycle === 'Dispatched' ? colors.surface : colors.successSoft }]}>
        <Text style={[styles.badgeText, { color: assignedTeam.lifecycle === 'Dispatched' ? colors.ink : colors.success }]}>{assignedTeam.lifecycle}</Text>
      </View> : null}
    </View> : null}

    {view.showMap ? <RouteMap team={team} destination={destination} route={view.routeAvailable ? toRoutePoints(snapshot.route) : []} stale={stale} teamLabel="Response Team" destinationLabel="Your reported location" /> : null}

    {enRoute ? <View style={styles.metrics}>
      <View style={styles.metric}>
        <Text style={styles.metricLabel}>{stale ? 'Estimated arrival (last known location)' : 'Estimated arrival'}</Text>
        <Text style={styles.metricValue}>{eta ?? ETA_UNAVAILABLE}</Text>
      </View>
      <View style={styles.metric}>
        <Text style={styles.metricLabel}>Distance</Text>
        <Text style={styles.metricValue}>{distance ?? 'Unavailable'}</Text>
      </View>
    </View> : null}
    {team ? <Text style={styles.caption}>Last updated {new Date(team.captured_at).toLocaleTimeString()} ({formatLocationAge(team.captured_at, now)})</Text> : null}
    {enRoute && eta ? <Text style={styles.caption}>Approx. travel time by road. Actual arrival may vary with traffic and conditions.</Text> : null}
    {failed ? <Text style={[styles.caption, { color: colors.warning }]}>Could not refresh. Showing the last update.</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  live: { borderColor: colors.success },
  stale: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  completed: { borderColor: colors.success, backgroundColor: colors.successSoft },
  kicker: { ...type.caption, fontFamily: type.label.fontFamily, color: colors.success, letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { ...type.heading, color: colors.ink },
  caption: { ...type.caption, color: colors.muted },
  badge: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { ...type.caption, fontFamily: type.label.fontFamily },
  teamCard: { flexDirection: 'column', alignItems: 'stretch', gap: space.sm, padding: space.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  teamName: { ...type.title, color: colors.ink },
  metrics: { flexDirection: 'column', gap: space.md },
  metric: { flex: 1, padding: space.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, gap: 2 },
  metricLabel: { ...type.caption, color: colors.muted },
  metricValue: { ...type.title, color: colors.ink },
});
