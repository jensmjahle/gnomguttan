import type { ReactNode } from 'react';
import { Modal, View, Text, Pressable, TextInput, ScrollView, Switch, StyleSheet, KeyboardAvoidingView, Platform, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { Ionicons } from '@expo/vector-icons';

export function MatrixSheet({ title, visible, onClose, children }: { title: string; visible: boolean; onClose: () => void; children: ReactNode }) {
  const { tokens, font } = useTheme(); const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <Pressable accessibilityLabel="Lukk dialog" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={{ maxHeight: '92%', backgroundColor: tokens.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom }}>
        <View style={{ padding: 18, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tokens.border }}>
          <Text accessibilityRole="header" style={{ flex: 1, color: tokens.textPrimary, fontFamily: font(700), fontSize: 20 }}>{title}</Text>
          <Pressable onPress={onClose} accessibilityLabel="Lukk" hitSlop={10}><Ionicons name="close" color={tokens.textSecondary} size={24} /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 14 }}>{children}</ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
export function MatrixField({ label, ...props }: TextInputProps & { label: string }) {
  const { tokens, font } = useTheme();
  return <View style={{ gap: 6 }}><Text style={{ color: tokens.textSecondary, fontFamily: font(500) }}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={tokens.textMuted} {...props} style={[{ borderWidth: 1, borderColor: tokens.border, color: tokens.textPrimary, borderRadius: 12, padding: 12, fontSize: 16, fontFamily: font(400), opacity: props.editable === false ? 0.6 : 1 }, props.style]} /></View>;
}
export function MatrixButton({ title, onPress, disabled = false, secondary = false, danger = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; danger?: boolean }) {
  const { tokens, font } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ padding: 13, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: secondary ? tokens.border : 'transparent', backgroundColor: secondary ? tokens.bgCard : tokens.accent, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 })}>
    <Text style={{ color: danger ? tokens.error : secondary ? tokens.textPrimary : tokens.accentFg, fontFamily: font(600) }}>{title}</Text>
  </Pressable>;
}
export function MatrixToggle({ title, value, onChange, disabled }: { title: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const { tokens } = useTheme(); return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ flex: 1, color: tokens.textPrimary }}>{title}</Text><Switch accessibilityLabel={title} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: tokens.accent }} /></View>;
}
export function MatrixNotice({ text, error = false }: { text?: string | null; error?: boolean }) {
  const { tokens } = useTheme(); return text ? <Text accessibilityRole={error ? 'alert' : undefined} style={{ color: error ? tokens.error : tokens.textMuted, lineHeight: 20 }}>{text}</Text> : null;
}
