import React, { ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, useWindowDimensions, View, ViewStyle } from 'react-native';
import { AlertCircle, ChevronRight, Inbox, X } from 'lucide-react-native';
import { colors, elevation, radius, space, type } from '@/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const body = <View style={[styles.screenInner, { paddingHorizontal: width < 680 ? space.lg : space.xl, paddingTop: space.lg + insets.top, paddingBottom: Math.max(space.xl, insets.bottom + space.sm) }, style]}>{children}</View>;
  return <View style={styles.screen}>{scroll ? <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}</View>;
}

export function PageHeader({ eyebrow, title, description, action, navigation }: { eyebrow?: string; title: string; description?: string; action?: ReactNode; navigation?: ReactNode }) {
  const { width } = useWindowDimensions();
  return <View style={styles.headerGroup}>{navigation ? <View style={styles.navigation}>{navigation}</View> : null}<View style={[styles.pageHeader, width < 680 && styles.stacked]}><View style={styles.headerCopy}>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text accessibilityRole="header" style={styles.title}>{title}</Text>{description ? <Text style={styles.description}>{description}</Text> : null}</View>{action}</View></View>;
}

export function Section({ title, description, action, children }: { title?: string; description?: string; action?: ReactNode; children: ReactNode }) {
  const { width } = useWindowDimensions();
  return <View style={styles.section}>{title || action ? <View style={[styles.sectionHead, width < 680 && styles.stacked]}><View style={styles.headerCopy}>{title ? <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text> : null}{description ? <Text style={styles.sectionDescription}>{description}</Text> : null}</View>{action}</View> : null}{children}</View>;
}

export function Card({ children, style, tone = 'default' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'default' | 'critical' | 'muted' }) {
  return <View style={[styles.card, tone === 'critical' && styles.cardCritical, tone === 'muted' && styles.cardMuted, style]}>{children}</View>;
}

export function MetricCard({ label, value, hint, tone = 'default' }: { label: string; value: string | number; hint?: string; tone?: 'default' | 'warning' | 'critical' | 'success' }) {
  return <Card style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, tone === 'critical' && { color: colors.critical }, tone === 'warning' && { color: colors.warning }, tone === 'success' && { color: colors.success }]}>{value}</Text>{hint ? <Text style={styles.caption}>{hint}</Text> : null}</Card>;
}

export function Button({ label, onPress, variant = 'primary', disabled, loading, icon }: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'quiet'; disabled?: boolean; loading?: boolean; icon?: ReactNode }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, styles[`button_${variant}`], pressed && styles.pressed, (disabled || loading) && styles.disabled]}>{loading ? <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.white : colors.ink} /> : icon}<Text style={[styles.buttonText, (variant === 'primary' || variant === 'danger') && styles.buttonTextLight]}>{loading ? `${label}…` : label}</Text></Pressable>;
}

export function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, label === 'Go back' && styles.backButton, pressed && styles.pressed]}>{children}{label === 'Go back' ? <Text style={styles.buttonText}>Back</Text> : null}</Pressable>;
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  const fields = React.Children.map(children, child => React.isValidElement<TextInputProps>(child) && (child.type === Input || child.type === TextArea) ? React.cloneElement(child, { accessibilityLabel: child.props.accessibilityLabel || label }) : child);
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{fields}{error ? <Text accessibilityRole="alert" style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.caption}>{hint}</Text> : null}</View>;
}

export function Input(props: TextInputProps) { return <TextInput placeholderTextColor={colors.subtle} {...props} style={[styles.input, props.multiline && styles.textarea, props.style]} />; }
export function TextArea(props: TextInputProps) { return <Input multiline textAlignVertical="top" numberOfLines={4} {...props} />; }

export function Select<T extends string>({ value, options, onChange, label }: { value: T; options: { label: string; value: T }[]; onChange: (value: T) => void; label: string }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.select}>{options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: value === option.value }} onPress={() => onChange(option.value)} style={[styles.selectOption, value === option.value && styles.selectOptionActive]}><Text style={[styles.label, value === option.value && { color: colors.brand }]}>{option.label}</Text></Pressable>)}</View>;
}

const statusTone: Record<string, { bg: string; fg: string }> = {
  pending: { bg: colors.warningSoft, fg: colors.warning }, dispatched: { bg: colors.infoSoft, fg: colors.info },
  responding: { bg: colors.respondingSoft, fg: colors.responding }, resolved: { bg: colors.successSoft, fg: colors.success },
  active: { bg: colors.successSoft, fg: colors.success }, inactive: { bg: colors.surfaceAlt, fg: colors.muted }
};
function humanize(value: string) { const text = value.replace(/_/g, ' ').trim(); return text ? text.charAt(0).toUpperCase() + text.slice(1) : text; }
export function StatusBadge({ value }: { value: string }) { const tone = statusTone[value.toLowerCase()] || statusTone.inactive; const label = humanize(value); return <View accessible accessibilityLabel={`Status: ${label}`} style={[styles.badge, { backgroundColor: tone.bg }]}><View style={[styles.dot, { backgroundColor: tone.fg }]} /><Text style={[styles.badgeText, { color: tone.fg }]}>{label}</Text></View>; }
export function TypeBadge({ value }: { value: string }) { const label = value === 'fire' ? 'Fire' : value === 'road' ? 'Road incident' : humanize(value); return <View accessible accessibilityLabel={`Incident type: ${label}`} style={styles.typeBadge}><Text style={styles.typeBadgeText}>{label}</Text></View>; }
export function Priority({ value }: { value: string }) { const critical = value === 'critical' || value === 'high'; const label = humanize(value); return <View accessible accessibilityLabel={`Priority: ${label}`} style={styles.priority}><View style={[styles.priorityBar, { backgroundColor: critical ? colors.critical : value === 'medium' ? colors.warning : colors.success }]} /><Text style={styles.label}>{label} priority</Text></View>; }

export function Banner({ title, message, tone = 'info', action }: { title: string; message?: string; tone?: 'info' | 'warning' | 'error' | 'success'; action?: ReactNode }) {
  const palette = tone === 'error' ? [colors.criticalSoft, colors.critical] : tone === 'warning' ? [colors.warningSoft, colors.warning] : tone === 'success' ? [colors.successSoft, colors.success] : [colors.infoSoft, colors.info];
  return <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={[styles.banner, { backgroundColor: palette[0], borderColor: palette[1] }]}><AlertCircle size={20} color={palette[1]} /><View style={styles.bannerCopy}><Text style={[styles.label, { color: palette[1] }]}>{title}</Text>{message ? <Text style={styles.bannerText}>{message}</Text> : null}{action}</View></View>;
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) { return <Card style={styles.state}><View style={styles.stateIcon}><Inbox size={26} color={colors.muted} /></View><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.stateMessage}>{message}</Text>{action}</Card>; }
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) { return <Banner title="Something went wrong" message={message} tone="error" action={onRetry ? <View style={styles.bannerAction}><Button label="Try again" variant="secondary" onPress={onRetry} /></View> : undefined} />; }
export function LoadingState({ rows = 3, label = 'Loading…' }: { rows?: number; label?: string }) { return <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.skeletonGroup}><Text style={styles.stateMessage}>{label}</Text>{Array.from({ length: rows }).map((_, i) => <View key={i} style={[styles.skeleton, { opacity: 1 - i * .15 }]} />)}</View>; }

export function ListRow({ title, subtitle, leading, trailing, onPress }: { title: string; subtitle?: string; leading?: ReactNode; trailing?: ReactNode; onPress?: () => void }) {
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const content = <>{leading ? <View style={[styles.rowLeading, compact && styles.rowLeadingCompact]}>{leading}</View> : null}<View style={[styles.rowCopy, compact && styles.fullWidth]}><Text style={styles.rowTitle}>{title}</Text>{subtitle ? <Text style={styles.caption}>{subtitle}</Text> : null}</View>{trailing ? <View style={compact && styles.rowTrailing}>{trailing}</View> : onPress ? <ChevronRight size={18} color={colors.subtle} /> : null}</>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.row, compact && styles.stacked, pressed && styles.rowPressed]}>{content}</Pressable> : <View style={[styles.row, compact && styles.stacked]}>{content}</View>;
}

export function ActionGroup({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  return <View style={[styles.actionGroup, width < 680 && styles.stacked]}>{React.Children.map(children, child => child ? <View style={width < 680 ? styles.fullWidth : styles.actionItem}>{child}</View> : null)}</View>;
}

export function ResponsiveGrid({ children, min = 250 }: { children: ReactNode; min?: number }) { const { width } = useWindowDimensions(); const columns = width >= 1040 ? 3 : width >= 680 ? 2 : 1; return <View style={styles.grid}>{React.Children.map(children, child => <View style={{ flexBasis: columns === 1 ? '100%' : `${100 / columns - 3}%`, flexGrow: 1, minWidth: columns === 1 ? 0 : min, maxWidth: '100%' }}>{child}</View>)}</View>; }

export function Dialog({ visible, title, children, onClose, footer }: { visible: boolean; title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.overlay}><View accessibilityViewIsModal style={styles.dialog}><View style={styles.dialogHead}><Text style={[styles.sectionTitle, { flex: 1, minWidth: 0 }]}>{title}</Text><IconButton label="Close dialog" onPress={onClose}><X size={20} color={colors.ink} /></IconButton></View><ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>{footer ? <View style={styles.dialogFooter}>{footer}</View> : null}</View></View></Modal>;
}

export function ConfirmationDialog({ visible, title, message, confirmLabel, destructive, onConfirm, onClose }: { visible: boolean; title: string; message: string; confirmLabel: string; destructive?: boolean; onConfirm: () => void; onClose: () => void }) {
  return <Dialog visible={visible} title={title} onClose={onClose} footer={<View style={styles.confirmActions}><Button variant="secondary" label="Cancel" onPress={onClose} /><Button variant={destructive ? 'danger' : 'primary'} label={confirmLabel} onPress={onConfirm} /></View>}><Text style={styles.bannerText}>{message}</Text></Dialog>;
}

export function DetailItem({ label, value }: { label: string; value?: ReactNode }) { return <View style={styles.detail}><Text style={styles.caption}>{label}</Text><Text style={styles.detailValue}>{value || 'Not available'}</Text></View>; }
export function ActionBar({ children }: { children: ReactNode }) { return <View style={styles.actionBar}><ActionGroup>{children}</ActionGroup></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, scroll: { flexGrow: 1 }, screenInner: { minWidth: 0, paddingBottom: space.xl, width: '100%', maxWidth: 1180, alignSelf: 'center', padding: space.xl, gap: space.xl },
  headerGroup: { gap: space.sm }, navigation: { alignItems: 'flex-start' }, stacked: { flexDirection: 'column', alignItems: 'stretch' }, fullWidth: { width: '100%', flex: 0 }, actionGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, actionItem: { minWidth: 0, maxWidth: '100%' }, rowLeadingCompact: { width: '100%', alignItems: 'flex-start' }, rowTrailing: { width: '100%', alignItems: 'flex-start', gap: space.sm, marginTop: space.xs }, backButton: { width: 'auto', minHeight: 44, paddingHorizontal: space.md, flexDirection: 'row', gap: space.sm },
  pageHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }, headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { ...type.label, color: colors.brand, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: space.xs }, title: { ...type.display, color: colors.ink }, description: { ...type.body, color: colors.muted, marginTop: space.xs, maxWidth: 650 },
  section: { gap: space.md }, sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }, sectionTitle: { ...type.heading, color: colors.ink }, sectionDescription: { ...type.caption, color: colors.muted, marginTop: 2 },
  card: { minWidth: 0, maxWidth: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space.lg, ...elevation }, cardCritical: { borderLeftWidth: 4, borderLeftColor: colors.critical }, cardMuted: { backgroundColor: colors.surfaceAlt },
  metric: { minHeight: 96, gap: space.xs, justifyContent: 'space-between' }, metricLabel: { ...type.label, color: colors.muted }, metricValue: { fontFamily: 'Quicksand-Bold', fontSize: 28, lineHeight: 34, color: colors.ink }, caption: { ...type.caption, color: colors.muted }, label: { ...type.label, color: colors.ink },
  button: { minWidth: 0, maxWidth: '100%', minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, borderWidth: 1 }, button_primary: { backgroundColor: colors.brand, borderColor: colors.brand }, button_secondary: { backgroundColor: colors.surface, borderColor: colors.borderStrong }, button_danger: { backgroundColor: colors.critical, borderColor: colors.critical }, button_quiet: { backgroundColor: 'transparent', borderColor: 'transparent' }, buttonText: { ...type.label, color: colors.ink, flexShrink: 1, textAlign: 'center' }, buttonTextLight: { color: colors.white }, pressed: { opacity: .78 }, focused: { borderColor: colors.info, borderWidth: 2 }, disabled: { opacity: .45 }, iconButton: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  field: { gap: 6 }, fieldLabel: { ...type.label, color: colors.ink }, fieldError: { ...type.caption, color: colors.critical }, input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: space.md, ...type.body, color: colors.ink }, textarea: { minHeight: 112, paddingTop: space.md }, select: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, selectOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, selectOptionActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 }, dot: { width: 7, height: 7, borderRadius: 4 }, badgeText: { ...type.caption, textTransform: 'capitalize' }, typeBadge: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 5 }, typeBadgeText: { ...type.label, color: colors.ink }, priority: { flexDirection: 'row', alignItems: 'center', gap: 7 }, priorityBar: { width: 3, height: 18, borderRadius: 2 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, borderRadius: radius.md, borderLeftWidth: 3 }, bannerCopy: { flex: 1, minWidth: 0, gap: 3 }, bannerText: { ...type.body, color: colors.ink }, bannerAction: { marginTop: space.sm },
  state: { alignItems: 'center', paddingVertical: space.xxxl }, stateIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: space.md }, stateMessage: { ...type.body, color: colors.muted, textAlign: 'center', maxWidth: 420, marginTop: space.xs, marginBottom: space.lg },
  skeletonGroup: { gap: space.md }, skeleton: { height: 88, backgroundColor: colors.border, borderRadius: radius.md },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.border }, rowPressed: { backgroundColor: colors.surfaceAlt }, rowLeading: { minWidth: 0 }, rowCopy: { flex: 1, minWidth: 0, gap: space.xs }, rowTitle: { ...type.body, fontFamily: 'Quicksand-SemiBold', color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg }, overlay: { flex: 1, backgroundColor: 'rgba(24,34,48,.48)', padding: space.md, justifyContent: 'center', alignItems: 'center' }, dialog: { width: '100%', maxWidth: 560, maxHeight: '90%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md }, dialogHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }, dialogFooter: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  detail: { minWidth: 0, flexBasis: '100%', flexGrow: 1, gap: 3 }, detailValue: { ...type.body, color: colors.ink }, actionBar: { gap: space.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.lg }, confirmActions: { gap: space.md }
});
