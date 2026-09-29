import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, ChevronRight, MapPin, ShieldCheck } from 'lucide-react-native';
import { Button, Card, Screen } from '@/components/ui';
import { colors, radius, space, type } from '@/theme/tokens';

const pages = [
  { icon: ShieldCheck, title: 'Report with confidence', body: 'PinaSafe supports road and fire incident reporting with an explicit review before submission.' },
  { icon: Camera, title: 'Capture live evidence', body: 'Evidence comes from the live camera and is classified securely by the server. Rejected images can be retaken.' },
  { icon: MapPin, title: 'Follow verified status', body: 'Track the incident lifecycle without invented distance, arrival time, or fallback coordinates.' }
];
export default function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const page = pages[index];
  const Icon = page.icon;
  return <Screen scroll={false} style={styles.screen}><View style={styles.brand}><Text style={styles.wordmark}>PinaSafe</Text><Text style={styles.kicker}>Emergency reporting, made accountable.</Text></View><Card style={styles.card}><View style={styles.icon}><Icon size={34} color={colors.brand} /></View><Text style={styles.title}>{page.title}</Text><Text style={styles.body}>{page.body}</Text><View style={styles.dots}>{pages.map((_, item) => <Pressable accessibilityRole="button" accessibilityLabel={`Go to introduction ${item + 1}`} key={item} onPress={() => setIndex(item)} style={[styles.dot, item === index && styles.dotActive]} />)}</View><Button label={index === pages.length - 1 ? 'Continue to PinaSafe' : 'Next'} onPress={() => index === pages.length - 1 ? onComplete() : setIndex(index + 1)} icon={<ChevronRight size={18} color={colors.white} />} /></Card></Screen>;
}
const styles = StyleSheet.create({ screen: { flex: 1, justifyContent: 'center', maxWidth: 720 }, brand: { marginBottom: space.xl }, wordmark: { ...type.display, color: colors.brand }, kicker: { ...type.body, color: colors.muted, marginTop: space.xs }, card: { padding: space.xxl, gap: space.lg }, icon: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }, title: { ...type.title, color: colors.ink }, body: { ...type.body, color: colors.muted, maxWidth: 520 }, dots: { flexDirection: 'row', gap: space.sm, marginVertical: space.md }, dot: { width: 28, height: 5, borderRadius: 3, backgroundColor: colors.border }, dotActive: { backgroundColor: colors.brand } });
