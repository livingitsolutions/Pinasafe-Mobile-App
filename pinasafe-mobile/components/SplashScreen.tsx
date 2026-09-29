import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import logo from '@/assets/images/logo_pinasafe.png';
import { colors, radius, space, type } from '@/theme/tokens';

export default function SplashScreen({ onFinish }: { onFinish: () => void }) {
  useEffect(() => { const timer = setTimeout(onFinish, 900); return () => clearTimeout(timer); }, [onFinish]);
  return <View style={styles.screen}><View style={styles.mark}><Image source={logo} resizeMode="contain" style={styles.logo} /></View><Text style={styles.name}>PinaSafe</Text><Text style={styles.caption}>Emergency coordination</Text></View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas }, mark: { width: 92, height: 92, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }, logo: { width: 70, height: 70 }, name: { ...type.display, color: colors.ink, marginTop: space.lg }, caption: { ...type.label, color: colors.muted, marginTop: space.xs } });
