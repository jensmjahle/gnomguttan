import { useMemo } from 'react';
import { Linking, Text, type TextStyle } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '@/theme/useTheme';

interface MarkdownTextProps {
  content: string;
  contentType: string;
  color: string;
}

/**
 * Renders VoceChat message content. `text/markdown` is rendered with
 * react-native-markdown-display (same markdown the website supports); anything
 * else is shown as plain text.
 */
export function MarkdownText({ content, contentType, color }: MarkdownTextProps) {
  const { tokens, font } = useTheme();

  const base: TextStyle = { color, fontFamily: font(400), fontSize: 15, lineHeight: 21 };

  const mdStyles = useMemo(
    () => ({
      body: base,
      paragraph: { marginTop: 0, marginBottom: 0, ...base },
      link: { color: tokens.accent, textDecorationLine: 'underline' as const },
      strong: { fontFamily: font(700) },
      em: { fontStyle: 'italic' as const },
      bullet_list: { marginVertical: 2 },
      ordered_list: { marginVertical: 2 },
      code_inline: {
        fontFamily: undefined,
        backgroundColor: tokens.bgHover,
        color: tokens.textPrimary,
        borderRadius: 4,
        paddingHorizontal: 4,
      },
      fence: {
        backgroundColor: tokens.bgHover,
        color: tokens.textPrimary,
        borderRadius: 6,
        padding: 8,
      },
      code_block: {
        backgroundColor: tokens.bgHover,
        color: tokens.textPrimary,
        borderRadius: 6,
        padding: 8,
      },
      blockquote: {
        backgroundColor: tokens.bgHover,
        borderColor: tokens.border,
        borderLeftWidth: 3,
        paddingHorizontal: 8,
      },
    }),
    [color, tokens, font],
  );

  if (contentType !== 'text/markdown') {
    return <Text style={base}>{content}</Text>;
  }

  return (
    <Markdown style={mdStyles} onLinkPress={(url) => { void Linking.openURL(url); return false; }}>
      {content}
    </Markdown>
  );
}
