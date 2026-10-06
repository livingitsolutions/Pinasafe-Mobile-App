import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useEmergency } from '@/contexts/EmergencyContext';
import { Card, EmptyState, ListRow, PageHeader, Screen, StatusBadge, TypeBadge } from '@/components/ui';

export default function ResponderHistory() {
  const { user } = useAuth();
  const { reports } = useEmergency();
  const history = useMemo(() => reports.filter(report => report.status === 'resolved' && (report.responderId === user?.id || report.responder_id === user?.id)), [reports, user?.id]);
  return <Screen><PageHeader eyebrow="Field operations" title="Response history" description="Review the responses you have completed." />{history.length === 0 ? <EmptyState title="No completed responses" message="Resolved incidents you handled appear here." /> : <Card>{history.map(report => <ListRow key={report.id} onPress={() => router.push(`/incident/${report.id}`)} leading={<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><TypeBadge value={report.type} /><StatusBadge value="resolved" /></View>} title={report.location} subtitle={report.description} />)}</Card>}</Screen>;
}
