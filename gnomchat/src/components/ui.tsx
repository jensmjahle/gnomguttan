import { type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type PressableProps, type ScrollViewProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { useTheme } from '@/theme/useTheme';
import type { FontWeight } from '@/theme/fonts';

export type IconName = keyof typeof Ionicons.glyphMap;

/** Themed text. */
export function T({ children, weight = 400, size = 15, color, muted, style, numberOfLines, selectable }: {
  children: ReactNode; weight?: FontWeight; size?: number; color?: string; muted?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number; selectable?: boolean;
}) {
  const { tokens, font } = useTheme();
  return (
    <Text selectable={selectable} numberOfLines={numberOfLines} style={[{ fontFamily: font(weight), fontWeight: font(weight) ? undefined : (String(weight) as TextStyle['fontWeight']), fontSize: size, color: color ?? (muted ? tokens.textMuted : tokens.textPrimary) }, style]}>
      {children}
    </Text>
  );
}

/** A screen with the theme background, optional pull-to-refresh and scroll. */
export function Screen({ children, scroll = true, refreshing, onRefresh, padded = true, contentStyle, ...rest }: {
  children: ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; padded?: boolean; contentStyle?: StyleProp<ViewStyle>;
} & Omit<ScrollViewProps, 'children' | 'refreshControl'>) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const padding = padded ? { padding: 16, paddingBottom: 16 + insets.bottom } : { paddingBottom: insets.bottom };
  return (
    <ThemedBackground>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[padding, { gap: 12 }, contentStyle]}
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} /> : undefined}
          {...rest}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padded ? padding : null, contentStyle]}>{children}</View>
      )}
    </ThemedBackground>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { tokens, radius } = useTheme();
  const base = [styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.border, borderRadius: radius.lg }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
}

export function Button({ title, onPress, variant = 'primary', icon, disabled, busy, style, small }: {
  title: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const { tokens, radius, font } = useTheme();
  const bg = variant === 'primary' ? tokens.accent : variant === 'danger' ? tokens.error : variant === 'secondary' ? tokens.bgSecondary : 'transparent';
  const fg = variant === 'primary' ? tokens.accentFg : variant === 'danger' ? '#fff' : variant === 'ghost' ? tokens.accent : tokens.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, borderRadius: radius.md, borderColor: variant === 'secondary' ? tokens.border : 'transparent', opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} size="small" /> : icon ? <Ionicons name={icon} size={small ? 15 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: font(600), fontWeight: font(600) ? undefined : '600', fontSize: small ? 13 : 15 }}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color, size = 22, badge, disabled, style }: {
  icon: IconName; onPress?: () => void; label: string; color?: string; size?: number; badge?: number; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { tokens } = useTheme();
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" hitSlop={8} onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.iconButton, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }, style]}>
      <Ionicons name={icon} size={size} color={color ?? tokens.textPrimary} />
      {badge ? <Badge count={badge} style={styles.iconBadge} /> : null}
    </Pressable>
  );
}

export function Badge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  const { tokens, font } = useTheme();
  if (!count) return null;
  return (
    <View style={[styles.badge, { backgroundColor: tokens.error }, style]}>
      <Text style={{ color: '#fff', fontSize: 11, fontFamily: font(700) }}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

export function Field({ label, hint, error, style, inputStyle, ...props }: TextInputProps & { label?: string; hint?: string; error?: string; inputStyle?: StyleProp<TextStyle> }) {
  const { tokens, radius, font } = useTheme();
  return (
    <View style={[{ gap: 6 }, style as StyleProp<ViewStyle>]}>
      {label ? <T weight={600} size={13} muted>{label}</T> : null}
      <TextInput
        placeholderTextColor={tokens.textMuted}
        {...props}
        style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgSecondary, borderColor: error ? tokens.error : tokens.border, borderRadius: radius.md, fontFamily: font(400) }, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, inputStyle]}
      />
      {error ? <T size={12} color={tokens.error}>{error}</T> : hint ? <T size={12} muted>{hint}</T> : null}
    </View>
  );
}

export function Row({ icon, title, subtitle, onPress, right, danger, chevron = Boolean(onPress) }: {
  icon?: IconName; title: string; subtitle?: string; onPress?: () => void; right?: ReactNode; danger?: boolean; chevron?: boolean;
}) {
  const { tokens } = useTheme();
  const content = (
    <>
      {icon ? <Ionicons name={icon} size={21} color={danger ? tokens.error : tokens.accent} style={{ width: 26 }} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T weight={500} color={danger ? tokens.error : undefined}>{title}</T>
        {subtitle ? <T size={12} muted numberOfLines={2}>{subtitle}</T> : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={tokens.textMuted} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: tokens.bgHover }]}>{content}</Pressable>;
}

export function ToggleRow({ title, subtitle, value, onChange, disabled }: { title: string; subtitle?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const { tokens } = useTheme();
  return (
    <Row title={title} subtitle={subtitle} chevron={false} right={<Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: tokens.accent, false: tokens.border }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as object)} />} />
  );
}

export function Section({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      {title || action ? (
        <View style={styles.sectionHead}>
          {title ? <T weight={700} size={13} muted style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</T> : <View />}
          {action}
        </View>
      ) : null}
      <Card style={{ padding: 0, overflow: 'hidden' }}>{children}</Card>
    </View>
  );
}

export function Divider() {
  const { tokens } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: tokens.border }} />;
}

export function Loading({ label }: { label?: string }) {
  const { tokens } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={tokens.accent} />
      {label ? <T muted size={13}>{label}</T> : null}
    </View>
  );
}

export function Empty({ icon = 'leaf-outline', title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View style={[styles.center, { paddingVertical: 40 }]}>
      <Ionicons name={icon} size={40} color={tokens.textMuted} />
      <T weight={700} size={17} style={{ textAlign: 'center' }}>{title}</T>
      {text ? <T muted style={{ textAlign: 'center' }}>{text}</T> : null}
      {action}
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  const { tokens, radius } = useTheme();
  if (!message) return null;
  return (
    <View style={[styles.error, { borderColor: tokens.error, borderRadius: radius.md, backgroundColor: tokens.bgCard }]}>
      <Ionicons name="alert-circle" size={18} color={tokens.error} />
      <T size={13} style={{ flex: 1 }} color={tokens.error}>{message}</T>
      {onRetry ? <Button small variant="ghost" title="Prøv igjen" onPress={onRetry} /> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const { tokens, font } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.chip, { borderColor: selected ? tokens.accent : tokens.border, backgroundColor: selected ? tokens.accentMuted : tokens.bgCard }]}>
      {icon ? <Ionicons name={icon} size={14} color={selected ? tokens.accent : tokens.textSecondary} /> : null}
      <Text style={{ color: selected ? tokens.accent : tokens.textSecondary, fontFamily: font(600), fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function OfflineNote({ updatedAt }: { updatedAt?: number }) {
  if (!updatedAt) return null;
  const minutes = Math.round((Date.now() - updatedAt) / 60000);
  return <T size={12} muted style={{ textAlign: 'center' }}>{`Viser lagrede data fra ${minutes < 1 ? 'nå nettopp' : `${minutes} min siden`}.`}</T>;
}

export function PressableScale(props: PressableProps & { style?: StyleProp<ViewStyle> }) {
  return <Pressable {...props} style={({ pressed }) => [props.style, pressed && { transform: [{ scale: 0.97 }] }]} />;
}

const styles = StyleSheet.create({
  card: { padding: 14, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderWidth: StyleSheet.hairlineWidth },
  buttonSmall: { paddingHorizontal: 10, paddingVertical: 6 },
  iconButton: { padding: 6 },
  iconBadge: { position: 'absolute', top: 0, right: 0 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderWidth: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
});
