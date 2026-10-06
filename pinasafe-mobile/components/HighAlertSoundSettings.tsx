import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Play, Square } from 'lucide-react-native';
import { Banner, Button, Dialog } from '@/components/ui';
import { colors, radius, space, type } from '@/theme/tokens';
import { AlertTonePreviewPlayer, DEFAULT_ALERT_TONE_ID, getAlertTonesFor } from '@/utils/alertTones';
import type { OperationalHighAlertAudioController, OperationalHighAlertAudioState } from '@/utils/operationalHighAlert';

type Note = { tone: 'info' | 'warning' | 'error' | 'success'; title: string; message: string } | null;

interface Props {
  visible: boolean;
  onClose: () => void;
  audioSupported: boolean;
  soundEnabled: boolean;
  soundBusy: boolean;
  soundState: OperationalHighAlertAudioState;
  selectedToneId: string;
  controller: OperationalHighAlertAudioController | null;
  onToggleSound: (enabled: boolean) => void;
  onSelectTone: (toneId: string) => void;
}

const TONES = getAlertTonesFor('command-center');
const PREVIEW_FAILED = 'This tone could not be played on this device. Choose another tone or use the default. Visual High Alerts are unaffected.';

export default function HighAlertSoundSettings({
  visible, onClose, audioSupported, soundEnabled, soundBusy, soundState, selectedToneId, controller, onToggleSound, onSelectTone,
}: Props) {
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const previewRef = useRef<AlertTonePreviewPlayer | null>(null);
  const testTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPreview = useCallback(() => {
    previewRef.current?.stop();
    setPreviewingId(null);
  }, []);

  const stopTest = useCallback(() => {
    if (testTimerRef.current) clearTimeout(testTimerRef.current);
    testTimerRef.current = null;
    controller?.stopTest();
    setTesting(false);
  }, [controller]);

  useEffect(() => () => {
    previewRef.current?.dispose();
    previewRef.current = null;
    if (testTimerRef.current) clearTimeout(testTimerRef.current);
  }, []);

  const close = () => {
    stopPreview();
    stopTest();
    setNote(null);
    onClose();
  };

  const preview = async (toneId: string) => {
    stopTest();
    setNote(null);
    if (!previewRef.current) previewRef.current = new AlertTonePreviewPlayer(() => setPreviewingId(null));
    setPreviewingId(toneId);
    const result = await previewRef.current.play(toneId);
    if (result !== 'playing') {
      setPreviewingId(null);
      setNote({ tone: 'warning', title: 'Preview unavailable', message: PREVIEW_FAILED });
    }
  };

  const select = (toneId: string) => {
    setNote(null);
    onSelectTone(toneId);
  };

  const test = async () => {
    stopPreview();
    setNote(null);
    if (!controller) return;
    if (!soundEnabled) {
      setNote({ tone: 'info', title: 'High Alert sound is off', message: 'Turn High Alert sound on to test it.' });
      return;
    }
    setTesting(true);
    try {
      await controller.testAlert();
      setNote({ tone: 'success', title: 'Test playing', message: 'You should hear the selected tone now. No incident was created or changed.' });
      testTimerRef.current = setTimeout(() => {
        testTimerRef.current = null;
        setTesting(false);
      }, controller.testDurationMs());
    } catch {
      setTesting(false);
      setNote({ tone: 'warning', title: 'Test sound did not play', message: 'The browser blocked or could not play the sound. Tap Test High Alert again, or choose another tone. Visual High Alerts are unaffected.' });
    }
  };

  const statusCopy = !audioSupported
    ? 'High Alert sound is not available on this device. Visual High Alerts still appear.'
    : !soundEnabled
      ? 'Off. Visual High Alerts still appear.'
      : soundState === 'activation-required'
        ? 'On. The browser needs one tap before it can play sound.'
        : soundState === 'unavailable'
          ? 'On, but sound playback is unavailable right now.'
          : 'On. Plays for confirmed High Alerts that have no response team yet.';

  return <Dialog
    visible={visible}
    title="High Alert sound"
    onClose={close}
    footer={<View style={styles.footer}>
      <Button variant="secondary" label="Done" onPress={close} />
      {testing
        ? <Button variant="secondary" label="Stop test" icon={<Square size={16} color={colors.ink} />} onPress={stopTest} />
        : <Button label="Test High Alert" icon={<Play size={16} color={colors.white} />} onPress={() => { void test(); }} disabled={!audioSupported || soundBusy} />}
    </View>}
  >
    <View style={styles.body}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="High Alert sound"
        accessibilityState={{ checked: soundEnabled, disabled: !audioSupported || soundBusy }}
        disabled={!audioSupported || soundBusy}
        onPress={() => onToggleSound(!soundEnabled)}
        style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
      >
        <View style={styles.toggleCopy}>
          <Text style={styles.heading}>High Alert sound</Text>
          <Text style={styles.caption}>{statusCopy}</Text>
        </View>
        <View style={[styles.track, soundEnabled && audioSupported && styles.trackOn]}>
          <View style={[styles.thumb, soundEnabled && audioSupported && styles.thumbOn]} />
        </View>
        <Text style={styles.toggleLabel}>{soundEnabled && audioSupported ? 'On' : 'Off'}</Text>
      </Pressable>

      <View style={styles.group}>
        <Text style={styles.heading}>Alert tone</Text>
        <Text style={styles.caption}>Applies to this Command Center on this device. Responder assignment sounds are separate.</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Alert tone" style={styles.toneList}>
          {TONES.map(tone => {
            const selected = tone.id === selectedToneId;
            const previewing = previewingId === tone.id;
            return <View key={tone.id} style={[styles.toneRow, selected && styles.toneRowSelected]}>
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={`${tone.name}${tone.id === DEFAULT_ALERT_TONE_ID ? ', default' : ''}`}
                accessibilityState={{ checked: selected }}
                onPress={() => select(tone.id)}
                style={styles.toneSelect}
              >
                <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Check size={14} color={colors.white} /> : null}</View>
                <View style={styles.toneCopy}>
                  <Text style={styles.toneName}>{tone.name}{tone.id === DEFAULT_ALERT_TONE_ID ? <Text style={styles.caption}>  Default</Text> : null}</Text>
                  <Text style={styles.caption}>{tone.description}</Text>
                  {selected ? <Text style={styles.selectedText}>Selected</Text> : null}
                </View>
              </Pressable>
              <Button
                variant="quiet"
                label={previewing ? 'Stop preview' : 'Preview'}
                icon={previewing ? <Square size={14} color={colors.ink} /> : <Play size={14} color={colors.ink} />}
                onPress={() => { if (previewing) stopPreview(); else void preview(tone.id); }}
                disabled={!AlertTonePreviewPlayer.isSupported()}
              />
            </View>;
          })}
        </View>
      </View>

      {note ? <Banner
        tone={note.tone}
        title={note.title}
        message={note.message}
        action={note.tone === 'warning' && selectedToneId !== DEFAULT_ALERT_TONE_ID
          ? <View style={styles.noteAction}><Button variant="secondary" label="Use default tone" onPress={() => select(DEFAULT_ALERT_TONE_ID)} /></View>
          : undefined}
      /> : null}
    </View>
  </Dialog>;
}

const styles = StyleSheet.create({
  body: { gap: space.xl, paddingBottom: space.sm },
  footer: { gap: space.sm },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, minHeight: 64 },
  toggleCopy: { flex: 1, gap: 2 },
  toggleLabel: { ...type.label, color: colors.ink, minWidth: 28 },
  track: { width: 44, height: 26, borderRadius: radius.pill, backgroundColor: colors.borderStrong, padding: 3, justifyContent: 'center' },
  trackOn: { backgroundColor: colors.success },
  thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white },
  thumbOn: { alignSelf: 'flex-end' },
  pressed: { opacity: 0.8 },
  group: { gap: space.sm },
  heading: { ...type.heading, color: colors.ink },
  caption: { ...type.caption, color: colors.muted },
  toneList: { gap: space.sm, marginTop: space.xs },
  toneRow: { flexDirection: 'column', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  toneRowSelected: { borderColor: colors.brand, borderWidth: 2, backgroundColor: colors.brandSoft },
  toneSelect: { flex: 1, minWidth: 0, width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: space.md, minHeight: 44, paddingVertical: space.xs },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioOn: { borderColor: colors.brand, backgroundColor: colors.brand },
  toneCopy: { flex: 1, gap: 2 },
  toneName: { ...type.label, color: colors.ink },
  selectedText: { ...type.caption, color: colors.brand, fontFamily: 'Quicksand-SemiBold' },
  noteAction: { alignSelf: 'flex-start', marginTop: space.sm },
});
