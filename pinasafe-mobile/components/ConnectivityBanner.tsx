import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';
import { colors, space, type } from '@/theme/tokens';
import { readOnlineStatus } from '@/utils/pwaInstall';

export const OFFLINE_TITLE = 'You’re offline';
export const OFFLINE_MESSAGE = 'Emergency actions require an internet connection. Updates may be delayed. If you are in immediate danger, call your local emergency hotline.';

export default function ConnectivityBanner() {
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const update = () => setOnline(readOnlineStatus(window));
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (online) return null;
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.banner, { paddingTop: space.sm + insets.top }]}>
    <WifiOff size={18} color={colors.white} />
    <View style={styles.copy}>
      <Text style={styles.title}>{OFFLINE_TITLE}</Text>
      <Text style={styles.message}>{OFFLINE_MESSAGE}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.sm, backgroundColor: colors.ink },
  copy: { flex: 1, gap: 2, maxWidth: 1180 },
  title: { ...type.label, color: colors.white },
  message: { ...type.caption, color: '#E4E7EC' },
});
