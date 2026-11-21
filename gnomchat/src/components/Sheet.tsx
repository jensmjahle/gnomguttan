import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { T, type IconName } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';

/** A bottom sheet for pickers, menus and small forms. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const { tokens, radius } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Lukk" />
        <View style={[styles.sheet, { backgroundColor: tokens.bgCard, borderTopLeftRadius: radius.lg * 1.5, borderTopRightRadius: radius.lg * 1.5, paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.grip, { backgroundColor: tokens.border }]} />
          {title ? <T weight={700} size={17} style={{ paddingHorizontal: 18, paddingBottom: 8 }}>{title}</T> : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type MenuAction = { label: string; icon?: IconName; danger?: boolean; selected?: boolean; hint?: string; onPress: () => void };

/** An action menu (long-press menus, "⋯" menus). */
export function ActionSheet({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title?: string; actions: MenuAction[] }) {
  const { tokens } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          onPress={() => { onClose(); action.onPress(); }}
          style={({ pressed }) => [styles.action, { backgroundColor: pressed ? tokens.bgHover : 'transparent' }]}
        >
          {action.icon ? <Ionicons name={action.icon} size={20} color={action.danger ? tokens.error : tokens.accent} /> : null}
          <View style={{ flex: 1 }}>
            <T weight={500} color={action.danger ? tokens.error : undefined}>{action.label}</T>
            {action.hint ? <T size={12} muted>{action.hint}</T> : null}
          </View>
          {action.selected ? <Ionicons name="checkmark" size={20} color={tokens.accent} /> : null}
        </Pressable>
      ))}
    </Sheet>
  );
}

export const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '😮', '😢', '👀'];
export const EMOJIS = [
  '👍', '👎', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👀', '💯', '🙏', '😍', '🤔', '😎', '💀', '🤣', '😅', '👏',
  '🫡', '💪', '🤡', '🥳', '😤', '🫠', '🍻', '🍺', '🐈', '🧙', '🎮', '🍕', '☕', '🌲', '⚡', '✅', '❌', '🙈',
];

export function EmojiSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (emoji: string) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Reager">
      <View style={styles.emojiGrid}>
        {EMOJIS.map((emoji) => (
          <Pressable key={emoji} accessibilityLabel={`Reager med ${emoji}`} onPress={() => { onClose(); onPick(emoji); }} style={styles.emoji}>
            <T size={28}>{emoji}</T>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '85%', paddingTop: 8 },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  emoji: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
});
