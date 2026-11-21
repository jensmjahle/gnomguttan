import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { useAppUsers } from '@/data/users';
import { Avatar } from '@/components/Avatar';
import { T } from '@/components/ui';
import type { CommentMention } from '@/types';
import { activeMentions } from '@/utils/comments.generated';

/** A text input that suggests people after "@" and keeps track of who was mentioned. */
export function MentionInput({ value, onChange, mentions, onMentionsChange, ...props }: Omit<TextInputProps, 'value' | 'onChange'> & {
  value: string; onChange: (text: string) => void; mentions: CommentMention[]; onMentionsChange: (mentions: CommentMention[]) => void;
}) {
  const { tokens, radius, font } = useTheme();
  const { data: users = [] } = useAppUsers();
  const [selection, setSelection] = useState({ start: value.length, end: value.length });

  const query = useMemo(() => {
    const before = value.slice(0, selection.start);
    const match = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    return match ? match[2] : null;
  }, [value, selection.start]);

  const suggestions = query === null ? [] : users.filter((user) => user.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);

  const pick = (user: { uid: number; name: string }) => {
    const before = value.slice(0, selection.start).replace(/@([^\s@]{0,30})$/, `@${user.name} `);
    const next = before + value.slice(selection.start);
    onChange(next);
    onMentionsChange(activeMentions(next, [...mentions, { uid: user.uid, name: user.name }]));
    setSelection({ start: before.length, end: before.length });
  };

  return (
    <View style={{ gap: 6 }}>
      {suggestions.length > 0 ? (
        <View style={[styles.suggestions, { backgroundColor: tokens.bgCard, borderColor: tokens.border, borderRadius: radius.md }]}>
          {suggestions.map((user) => (
            <Pressable key={user.uid} onPress={() => pick(user)} style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: tokens.bgHover }]}>
              <Avatar uid={user.uid} name={user.name} avatarUpdatedAt={user.avatarUpdatedAt} size={24} />
              <T weight={500}>{user.name}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
      <TextInput
        multiline
        placeholderTextColor={tokens.textMuted}
        {...props}
        value={value}
        onChangeText={(text) => { onChange(text); onMentionsChange(activeMentions(text, mentions)); }}
        onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
        style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgSecondary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }, props.style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  suggestions: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  input: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, maxHeight: 140, minHeight: 42 },
});
