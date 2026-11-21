import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { T } from '@/components/ui';

export type ReactionGroup = { emoji: string; count: number; names: string[]; mine: boolean };

export function ReactionBar({ groups, onToggle, onAdd, compact }: { groups: ReactionGroup[]; onToggle: (emoji: string) => void; onAdd?: () => void; compact?: boolean }) {
  const { tokens } = useTheme();
  if (!groups.length && !onAdd) return null;
  return (
    <View style={styles.bar}>
      {groups.map((group) => (
        <Pressable
          key={group.emoji}
          accessibilityLabel={`${group.emoji} ${group.count}: ${group.names.join(', ')}`}
          onPress={() => onToggle(group.emoji)}
          style={[styles.chip, compact && styles.chipCompact, { borderColor: group.mine ? tokens.accent : tokens.border, backgroundColor: group.mine ? tokens.accentMuted : tokens.bgSecondary }]}
        >
          <T size={compact ? 13 : 15}>{group.emoji}</T>
          <T size={12} weight={600} color={group.mine ? tokens.accent : tokens.textSecondary}>{group.count}</T>
        </Pressable>
      ))}
      {onAdd ? (
        <Pressable accessibilityLabel="Legg til reaksjon" onPress={onAdd} style={[styles.chip, compact && styles.chipCompact, { borderColor: tokens.border }]}>
          <Ionicons name="happy-outline" size={compact ? 14 : 16} color={tokens.textMuted} />
          <T size={12} muted>+</T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Feed reactions are a list of {emoji, uid, actorName}. */
export function groupFeedReactions(reactions: { emoji: string; uid: number; actorName: string }[] = [], myUid?: number): ReactionGroup[] {
  const map = new Map<string, ReactionGroup>();
  for (const reaction of reactions) {
    const group = map.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, names: [], mine: false };
    group.count += 1;
    group.names.push(reaction.actorName);
    if (reaction.uid === myUid) group.mine = true;
    map.set(reaction.emoji, group);
  }
  return [...map.values()];
}

/** Comment reactions are emoji → uids. */
export function groupCommentReactions(reactions: Record<string, number[]> = {}, myUid: number | undefined, nameOf: (uid: number) => string): ReactionGroup[] {
  return Object.entries(reactions).filter(([, uids]) => uids.length > 0).map(([emoji, uids]) => ({ emoji, count: uids.length, names: uids.map(nameOf), mine: myUid !== undefined && uids.includes(myUid) }));
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  chipCompact: { paddingHorizontal: 7, paddingVertical: 2 },
});
