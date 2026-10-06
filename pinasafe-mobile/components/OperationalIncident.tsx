import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { MapPin, ShieldCheck } from 'lucide-react-native';
import { Banner, Button, Card, EmptyState, ErrorState, ListRow, Priority, StatusBadge, TypeBadge } from '@/components/ui';
import { colors, radius, space, type } from '@/theme/tokens';
import type { PrivateEvidenceItem } from '@/services/apiService';
import type { OperationalCluster, OperationalMemberReport } from '@/types/operationalCluster';
import { formatOperationalTime, formatReportCount, getOperationalLocation } from '@/utils/operationalCluster';

export type MemberEvidenceState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: PrivateEvidenceItem[] };

export function OperationalIncidentCard({ cluster, onOpen, onOpenMap }: {
  cluster: OperationalCluster;
  onOpen: () => void;
  onOpenMap: (url: string) => void;
}) {
  const location = getOperationalLocation(cluster);
  const subtitle = `${formatReportCount(cluster.reportCount)} · First reported ${formatOperationalTime(cluster.firstReportedAt)} · Latest report ${formatOperationalTime(cluster.latestReportedAt)}`;

  return <ListRow
    onPress={onOpen}
    leading={<TypeBadge value={cluster.type || 'incident'} />}
    title={location.text}
    subtitle={subtitle}
    trailing={<View style={styles.rowActions}>
      <StatusBadge value={cluster.status} />
      {cluster.priority ? <Priority value={cluster.priority} /> : null}
      {location.mapUrl ? <Button variant="quiet" label="Open in Maps" onPress={() => onOpenMap(location.mapUrl as string)} icon={<MapPin size={16} color={colors.ink} />} /> : null}
      <Button variant="secondary" label="View Incident" onPress={onOpen} />
    </View>}
  />;
}

export function OperationalIncidentHeader({ cluster, onOpenMap }: { cluster: OperationalCluster; onOpenMap: (url: string) => void }) {
  const location = getOperationalLocation(cluster);

  return <Card tone={cluster.priority === 'critical' ? 'critical' : 'default'}>
    <View style={styles.badges}>
      <TypeBadge value={cluster.type || 'incident'} />
      <StatusBadge value={cluster.status} />
      {cluster.priority ? <Priority value={cluster.priority} /> : null}
    </View>
    <Text style={styles.count}>{formatReportCount(cluster.reportCount)}</Text>
    <Text style={styles.caption}>Independent citizen reports associated with one operational incident. Status and priority summarize the reports below.</Text>
    <View style={styles.location}><MapPin size={20} color={colors.brand} /><Text style={styles.locationText}>{location.text}</Text></View>
    <View style={styles.times}>
      <Text style={styles.caption}>First reported {formatOperationalTime(cluster.firstReportedAt)}</Text>
      <Text style={styles.caption}>Latest report {formatOperationalTime(cluster.latestReportedAt)}</Text>
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
  rowActions: { alignItems: 'flex-end', gap: space.sm, maxWidth: 200 },
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
