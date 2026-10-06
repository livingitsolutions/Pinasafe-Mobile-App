import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Download, Share } from 'lucide-react-native';
import { useInstallPrompt } from '@/contexts/InstallPromptContext';
import { Banner, Button, Card } from '@/components/ui';
import { colors, radius, space, type } from '@/theme/tokens';

export default function InstallPrompt() {
  const { presentation, status, install, dismiss } = useInstallPrompt();

  if (status === 'installed') {
    return <Banner tone="success" title="PinaSafe installed" message="Open PinaSafe from your home screen or app list." />;
  }
  if (status === 'accepted') {
    return <Banner tone="info" title="Installing PinaSafe" message="Your browser is adding PinaSafe. It appears on your home screen when finished." />;
  }
  if (status === 'failed') {
    return <Banner tone="warning" title="Install unavailable" message="Your browser could not install PinaSafe right now. You can keep using PinaSafe here." />;
  }
  if (presentation === 'hidden') return null;

  const ios = presentation === 'ios-instructions';
  return <Card style={styles.card}>
    <View style={styles.icon}>{ios ? <Share size={20} color={colors.brand} /> : <Download size={20} color={colors.brand} />}</View>
    <View style={styles.copy}>
      <Text style={styles.title}>Install PinaSafe</Text>
      <Text style={styles.message}>{ios
        ? 'Tap Share in your browser, then choose Add to Home Screen.'
        : 'Add PinaSafe to your home screen for quicker access.'} An internet connection is still needed to send reports.</Text>
      <View style={styles.actions}>
        {ios ? null : <Button variant="secondary" label="Install PinaSafe" onPress={() => { void install(); }} loading={status === 'prompting'} />}
        <Button variant="quiet" label="Not now" onPress={dismiss} />
      </View>
    </View>
  </Card>;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: space.xs },
  title: { ...type.heading, color: colors.ink },
  message: { ...type.body, color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
