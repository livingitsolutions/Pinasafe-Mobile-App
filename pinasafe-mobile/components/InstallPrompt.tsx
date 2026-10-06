import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Download, Share } from 'lucide-react-native';
import { useInstallPrompt } from '@/contexts/InstallPromptContext';
import { Banner, Button, Card } from '@/components/ui';
import { colors, radius, space, type } from '@/theme/tokens';

export default function InstallPrompt({ manual = false }: { manual?: boolean } = {}) {
  const { presentation: promotion, manualPresentation, status, install } = useInstallPrompt();
  const presentation = manual ? manualPresentation : promotion;

  if (status === 'installed') return null;
  if (status === 'accepted' && !manual) return <Banner tone="info" title="Install requested" message="Complete any remaining browser steps. Installation is not confirmed yet." />;
  if (status === 'failed' && !manual) return <Banner tone="warning" title="Install unavailable" message="Your browser could not open installation. Try Install app or Add to Home Screen in the browser menu. You can keep using PinaSafe here." />;
  if (presentation === 'hidden') return null;

  const ios = presentation === 'ios-instructions';
  const prompt = presentation === 'prompt';
  return <Card style={styles.card}>
    <View style={styles.icon}>{ios ? <Share size={20} color={colors.brand} /> : <Download size={20} color={colors.brand} />}</View>
    <View style={styles.copy}>
      <Text style={styles.title}>Install PinaSafe</Text>
      <Text style={styles.message}>{ios
        ? 'Tap Share, then Add to Home Screen.'
        : prompt ? 'Add PinaSafe to your home screen for quicker access.'
          : 'Open your browser menu and look for Install app or Add to Home Screen. If neither is available, keep using PinaSafe in your browser.'} An internet connection is still needed to send reports.</Text>
      {status === 'failed' ? <Text accessibilityRole="alert" style={styles.message}>Your browser could not open installation. Use the browser menu to try again. You can keep using PinaSafe here.</Text> : null}
      {status === 'accepted' ? <Text style={styles.message}>Installation is not confirmed yet. Complete any remaining browser steps.</Text> : null}
      <View style={styles.actions}>
        {prompt ? <Button variant="secondary" label="Install PinaSafe" onPress={() => { void install(); }} loading={status === 'prompting'} /> : null}
      </View>
    </View>
  </Card>;
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  copy: { minWidth: 0, gap: space.xs },
  title: { ...type.heading, color: colors.ink },
  message: { ...type.body, color: colors.muted },
  actions: { gap: space.sm, marginTop: space.sm },
});
