import { Linking, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '@/theme/useTheme';
import { splitMentions } from '@/utils/comments.generated';
import type { CommentMention } from '@/types';

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

/** Text with tappable @mentions (open the profile) and links. */
export function CommentText({ text, mentions, size = 15, color }: { text: string; mentions?: CommentMention[]; size?: number; color?: string }) {
  const { tokens, font } = useTheme();
  const navigation = useNavigation();
  return (
    <Text selectable style={{ fontFamily: font(400), fontSize: size, color: color ?? tokens.textPrimary, lineHeight: size * 1.4 }}>
      {splitMentions(text, mentions).map((segment, index) => {
        if (segment.mention) {
          const uid = segment.mention.uid;
          return <Text key={index} onPress={() => navigation.navigate('Profile', { uid })} style={{ color: tokens.accent, fontFamily: font(600) }}>{segment.text}</Text>;
        }
        return segment.text.split(URL_PATTERN).map((part, partIndex) =>
          URL_PATTERN.test(part)
            ? <Text key={`${index}-${partIndex}`} style={{ color: tokens.accent, textDecorationLine: 'underline' }} onPress={() => void Linking.openURL(part)}>{part}</Text>
            : <Text key={`${index}-${partIndex}`}>{part}</Text>,
        );
      })}
    </Text>
  );
}
