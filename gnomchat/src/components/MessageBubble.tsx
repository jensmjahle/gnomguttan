import { memo } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Image } from 'expo-image';
import { Avatar } from './Avatar';
import { MarkdownText } from './MarkdownText';
import { useTheme } from '@/theme/useTheme';
import { vocechatService } from '@/services/vocechat';
import { useChatStore } from '@/store/chatStore';
import type { ChatMessage } from '@/types';

interface MessageBubbleProps {
  message: ChatMessage;
  myUid: number;
  showHeader: boolean;
}

function normalizeMentionUids(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  const result: number[] = [];
  const seen = new Set<number>();
  for (const item of value) {
    const rawUid =
      typeof item === 'object' && item !== null && 'uid' in item
        ? (item as { uid?: unknown }).uid
        : item;
    const uid =
      typeof rawUid === 'number'
        ? rawUid
        : typeof rawUid === 'string' && /^\d+$/.test(rawUid)
          ? Number(rawUid)
          : Number.NaN;

    if (Number.isInteger(uid) && uid >= 0 && !seen.has(uid)) {
      seen.add(uid);
      result.push(uid);
    }
  }

  return result;
}

function resolveMentionNames(
  content: string,
  mentions: unknown,
  usersById: Record<number, { name: string } | undefined>,
): string {
  let resolved = content;
  for (const uid of normalizeMentionUids(mentions)) {
    const name = usersById[uid]?.name;
    if (!name) continue;

    // The negative lookahead prevents UID 1 from matching the start of @12.
    resolved = resolved.replace(new RegExp('@' + uid + '(?!\\d)', 'g'), '@' + name);
  }
  return resolved;
}
function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function MessageBubbleImpl({ message, myUid, showHeader }: MessageBubbleProps) {
  const { tokens, font, radius } = useTheme();
  const isSelf = message.from_uid === myUid;
  const sender = useChatStore((s) => s.usersById[message.from_uid]);
  const usersById = useChatStore((s) => s.usersById);
  const renderedContent = resolveMentionNames(message.content, message.properties?.mentions, usersById);

  const bubbleColor = isSelf ? tokens.msgSelfBg : tokens.msgOtherBg;
  const textColor = tokens.textPrimary;

  // VoceChat file messages have content_type "vocechat/file"; the real mime is in
  // properties.content_type (e.g. "image/png"). Treat those as images/files.
  const fileMime = message.properties?.content_type ?? '';
  const isFileMessage = message.content_type === 'vocechat/file';
  const isImage =
    message.content_type.startsWith('image/') || (isFileMessage && fileMime.startsWith('image/'));
  const isFile = !isImage && isFileMessage;

  return (
    <View style={[styles.row, isSelf ? styles.rowSelf : styles.rowOther]}>
      {!isSelf && (
        <View style={styles.avatarSlot}>
          {showHeader && (
            <Avatar uid={message.from_uid} name={sender?.name} avatarUpdatedAt={sender?.avatar_updated_at} size={32} />
          )}
        </View>
      )}

      <View style={styles.bubbleWrap}>
        {showHeader && !isSelf && (
          <Text style={[styles.sender, { color: tokens.textSecondary, fontFamily: font(600) }]}>
            {sender?.name ?? `User ${message.from_uid}`}
          </Text>
        )}
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: bubbleColor,
              borderColor: tokens.border,
              borderRadius: radius.md,
            },
          ]}
        >
          {isImage ? (
            <Pressable onPress={() => void Linking.openURL(vocechatService.resourceFileUrl(message.content))}>
              <Image
                source={{ uri: vocechatService.resourceFileUrl(message.content, { thumbnail: true }) }}
                style={[
                  styles.image,
                  message.properties?.width && message.properties?.height
                    ? { aspectRatio: message.properties.width / message.properties.height, height: undefined }
                    : null,
                ]}
                contentFit="cover"
                transition={120}
              />
            </Pressable>
          ) : isFile ? (
            <Pressable onPress={() => void Linking.openURL(vocechatService.resourceFileUrl(message.content, { download: true }))}>
              <Text style={{ color: tokens.accent, fontFamily: font(500), textDecorationLine: 'underline' }}>
                📎 {message.properties?.name ?? 'Attachment'}
              </Text>
            </Pressable>
          ) : (
            <MarkdownText content={renderedContent} contentType={message.content_type} color={textColor} />
          )}
          <Text style={[styles.time, { color: tokens.textMuted, fontFamily: font(400) }]}>
            {formatTime(message.created_at)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 2, paddingHorizontal: 10, gap: 8 },
  rowSelf: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  avatarSlot: { width: 32 },
  bubbleWrap: { maxWidth: '80%' },
  sender: { fontSize: 12, marginBottom: 2, marginLeft: 4 },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth },
  time: { fontSize: 10, alignSelf: 'flex-end', marginTop: 2 },
  image: { width: 220, height: 220, borderRadius: 8, marginBottom: 4 },
});

export const MessageBubble = memo(MessageBubbleImpl);
