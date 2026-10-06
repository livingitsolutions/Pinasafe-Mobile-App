import React from 'react';
import { formatResponseTime, getOperationalResolutionDisplayTimestamp } from '@/utils/responseTiming';
import { Image, StyleSheet, Text, View } from 'react-native';
import { MapPin, ShieldCheck } from 'lucide-react-native';
import { Banner, Button, Card, EmptyState, ErrorState, ListRow, Priority, StatusBadge, TypeBadge } from '@/components/ui';
import { colors, radius, space, type } from '@/theme/tokens';
import type { PrivateEvidenceItem } from '@/services/apiService';
import type { OperationalCluster, OperationalMemberReport } from '@/types/operationalCluster';
import { formatOperationalTime, formatReportCount, getOperationalLocation } from '@/utils/operationalCluster';
import { getOperationalHighAlertPresentation } from '@/utils/operationalHighAlert';

export type MemberEvidenceState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: PrivateEvidenceItem[] };

function getOperationalTypeLabel(typeValue: string | null): string {
  if (!typeValue) return 'INCIDENT';
  if (typeValue.toLowerCase() === 'road') return 'ROAD INCIDENT';
  return typeValue.toUpperCase();
}

function getReporterConfirmationCopy(distinctReporterCount: number): string {
  return `confirmed by ${distinctReporterCount} independent ${distinctReporterCount === 1 ? 'reporter' : 'reporters'}`;
}

export function OperationalIncidentCard({ cluster, onOpen, onOpenMap, isAdmin = false, onAssignDispatch }: {
  cluster: OperationalCluster;
  onOpen: () => void;
  onOpenMap: (url: string) => void;
  isAdmin?: boolean;
  onAssignDispatch?: () => void;
}) {
  const location = getOperationalLocation(cluster);
  const subtitle = `${formatReportCount(cluster.reportCount)} · First reported ${formatOperationalTime(cluster.firstReportedAt)} · Latest report ${formatOperationalTime(cluster.latestReportedAt)}`;
  const alert = getOperationalHighAlertPresentation(cluster);

  return <>
    {alert.corroborated ? <View style={[styles.highAlert, alert.active ? styles.highAlertActive : styles.highAlertSettled]}>
      <Text style={[styles.highAlertTitle, alert.active ? styles.highAlertTitleActive : styles.highAlertTitleSettled]}>{alert.label}</Text>
      <Text style={styles.highAlertSummary}>
        {`${getOperationalTypeLabel(cluster.type)} reported at ${location.text}`}
      </Text>
      <Text style={styles.highAlertCopy}>
        {`${formatReportCount(cluster.reportCount).toLowerCase()} received · ${getReporterConfirmationCopy(cluster.distinctReporterCount)}`}
      </Text>
      {alert.active ? <>
        <Text style={styles.highAlertCopy}>
          Independently confirmed by multiple reporters. Immediate dispatch required. Alert continues until a response team is assigned.
        </Text>
        {isAdmin && onAssignDispatch ? <Button
          variant="danger"
          label="Assign Dispatch"
          onPress={onAssignDispatch}
        /> : null}
      </> : alert.assigned ? <Text style={styles.highAlertCopy}>Response team assigned</Text> : null}
    </View> : null}
    <View style={styles.queueItem}>
      <ListRow leading={<TypeBadge value={cluster.type || 'incident'} />} title={location.text} subtitle={subtitle} onPress={onOpen} />
      <View style={styles.badges}>
        <StatusBadge value={cluster.status} />
        {cluster.priority ? <Priority value={cluster.priority} /> : null}
      </View>
      {cluster.assignedTeams.length ? <Text style={styles.caption}>Response team assigned</Text> : null}
      <View style={styles.queueActions}>
        <Button variant={alert.active && isAdmin ? 'secondary' : 'primary'} label="View Incident" onPress={onOpen} />
        {location.mapUrl ? <Button variant="quiet" label="Open in Maps" onPress={() => onOpenMap(location.mapUrl as string)} icon={<MapPin size={16} color={colors.ink} />} /> : null}
      </View>
    </View>
  </>;
}

export function OperationalIncidentHeader({ cluster, onOpenMap }: { cluster: OperationalCluster; onOpenMap: (url: string) => void }) {
  const location = getOperationalLocation(cluster);
  const resolvedTimestamp = getOperationalResolutionDisplayTimestamp(cluster);
  const responseTime = formatResponseTime(cluster.firstReportedAt, resolvedTimestamp);

  return <Card tone={cluster.priority === 'critical' ? 'critical' : 'default'}>
    <View style={styles.badges}>
      <TypeBadge value={cluster.type || 'incident'} />
      <StatusBadge value={cluster.status} />
      {cluster.priority ? <Priority value={cluster.priority} /> : null}
    </View>
    <Text style={styles.count}>{formatReportCount(cluster.reportCount)}</Text>
    <Text style={styles.caption}>Reports about this incident. Review each report and its response status below.</Text>
    <View style={styles.location}><MapPin size={20} color={colors.brand} /><Text style={styles.locationText}>{location.text}</Text></View>
    <View style={styles.times}>
      <Text style={styles.caption}>First reported {formatOperationalTime(cluster.firstReportedAt)}</Text>
      <Text style={styles.caption}>Latest report {formatOperationalTime(cluster.latestReportedAt)}</Text>
      {resolvedTimestamp ? <Text style={styles.caption}>Resolved {formatOperationalTime(resolvedTimestamp)}</Text> : null}
      {responseTime ? <Text style={styles.caption}>Response time {responseTime}</Text> : null}
    </View>
    {location.mapUrl
      ? <Button variant="secondary" label="Open location in maps" onPress={() => onOpenMap(location.mapUrl as string)} icon={<MapPin size={18} color={colors.ink} />} />
      : <Banner title="Map coordinates unavailable" message="Map coordinates are unavailable for this incident." tone="info" />}
  </Card>;
}

export function MemberEvidence({ state }: { state: MemberEvidenceState | undefined }) {
  if (!state || state.status === 'loading') return <Text style={styles.caption}>Loading evidence…</Text>;
  if (state.status === 'error') return <ErrorState message={state.message} />;
  if (state.items.length === 0) return <EmptyState title="No evidence available" message="No accepted evidence is attached to this report." />;

  return <View style={styles.evidenceGrid}>{state.items.map(item => <Card key={item.id} style={styles.evidenceCard}>
    <Image accessibilityLabel={`${item.evidenceRole === 'supplementary' ? 'Supplementary' : 'Accepted'} incident evidence`} source={{ uri: item.url }} resizeMode="cover" style={styles.image} />
    <View style={styles.evidenceMeta}>
      <ShieldCheck size={18} color={colors.success} />
      <View style={{ flex: 1 }}>
        <Text style={styles.evidenceTitle}>{item.evidenceRole === 'supplementary' ? 'Supplementary evidence' : item.classification ? `Server-verified ${item.classification.label}` : 'Accepted incident evidence'}</Text>
        <Text style={styles.caption}>{item.classification ? (item.classification.confidence == null ? 'Classification accepted' : `${Math.round(item.classification.confidence * 100)}% confidence`) : 'Not classified'} · {item.width}×{item.height}</Text>
      </View>
    </View>
  </Card>)}</View>;
}

export function OperationalMemberSection({ member, index, evidence, canDispatch, onDispatch, onOpenReport }: {
  member: OperationalMemberReport;
  index: number;
  evidence: MemberEvidenceState | undefined;
  canDispatch: boolean;
  onDispatch: () => void;
  onOpenReport?: () => void;
}) {
  return <Card>
    <View style={styles.badges}>
      <Text style={styles.memberTitle}>Report {index + 1}</Text>
      <StatusBadge value={member.status || 'pending'} />
      {member.priority ? <Priority value={member.priority} /> : null}
    </View>
    <Text style={styles.description}>{member.description || 'No description provided.'}</Text>
    <Text style={styles.caption}>Reported {formatOperationalTime(member.created_at)}</Text>
    <Text style={styles.caption}>{member.assigned_team_id ? 'A response team is assigned to this report.' : 'No response team assigned to this report.'}</Text>
    <View style={styles.evidence}><MemberEvidence state={evidence} /></View>
    {canDispatch ? <Button label="Dispatch this report" onPress={onDispatch} /> : null}
    {onOpenReport ? <Button variant="quiet" label="Open this report" onPress={onOpenReport} /> : null}
  </Card>;
}

const styles = StyleSheet.create({
  queueItem: { minWidth: 0, gap: space.sm, paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  queueActions: { gap: space.sm, marginTop: space.sm },
  highAlert: { gap: space.sm, padding: space.md, marginBottom: space.md, borderRadius: radius.md, borderWidth: 2 },
  highAlertActive: { borderColor: colors.critical, backgroundColor: colors.criticalSoft },
  highAlertSettled: { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  highAlertTitle: { ...type.heading },
  highAlertTitleActive: { color: colors.critical },
  highAlertTitleSettled: { color: colors.ink },
  highAlertSummary: { ...type.label, color: colors.ink },
  highAlertCopy: { ...type.body, color: colors.ink },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  count: { ...type.heading, color: colors.ink, marginTop: space.lg },
  caption: { ...type.caption, color: colors.muted, marginTop: 2 },
  location: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, marginVertical: space.lg, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  locationText: { ...type.body, color: colors.ink, flex: 1 },
  times: { gap: 2, marginBottom: space.lg },
  memberTitle: { ...type.label, color: colors.ink },
  description: { ...type.body, color: colors.ink, marginVertical: space.md },
  evidence: { marginVertical: space.md },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  evidenceCard: { width: '100%', maxWidth: 520, padding: 0, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.surfaceAlt },
  evidenceMeta: { flexDirection: 'row', gap: space.sm, padding: space.lg },
  evidenceTitle: { ...type.label, color: colors.ink },
});
