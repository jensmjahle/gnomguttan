import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { MessageBubble } from '@/components/MessageBubble';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { vocechatService } from '@/services/vocechat';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import type { RootStackParamList } from '@/navigation/types';
import type { ChatMessage, SSEChatEvent } from '@/types';

type ChatRoute = RouteProp<RootStackParamList, 'Chat'>;

export function ChatScreen() {
  const route = useRoute<ChatRoute>();
  const { threadKey, gid, uid } = route.params;
  const { tokens, font, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const myUid = useAuthStore((s) => s.user?.uid) ?? 0;

  const messages = useChatStore((s) => s.messages[threadKey] ?? []);
  const setHistory = useChatStore((s) => s.setHistory);
  const prependHistory = useChatStore((s) => s.prependHistory);
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const cacheUsers = useChatStore((s) => s.cacheUsers);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const reachedStart = useRef(false);

  const fetchHistory = useCallback(
    (before?: number) =>
      gid !== undefined
        ? vocechatService.getGroupHistory(gid, before)
        : vocechatService.getUserHistory(uid as number, before),
    [gid, uid],
  );

  useEffect(() => {
    setActiveThread(threadKey);
    let active = true;
    (async () => {
      try {
        const history = await fetchHistory();
        if (!active) return;
        setHistory(threadKey, history);
        const uids = [...new Set(history.map((m) => m.from_uid))];
        const infos = await Promise.all(uids.map((u) => vocechatService.getUserInfo(u).catch(() => null)));
        if (active) cacheUsers(infos.filter((u): u is NonNullable<typeof u> => !!u));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      setActiveThread(null);
    };
  }, [threadKey, fetchHistory, setActiveThread, setHistory, cacheUsers]);

  const loadOlder = useCallback(async () => {
    if (loadingMore || reachedStart.current || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0].mid;
      const older = await fetchHistory(oldest);
      if (older.length === 0) reachedStart.current = true;
      else prependHistory(threadKey, older);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, messages, fetchHistory, prependHistory, threadKey]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setDraft('');
    setSending(true);
    try {
      const mid =
        gid !== undefined
          ? await vocechatService.sendGroupMessage(gid, content)
          : await vocechatService.sendDirectMessage(uid as number, content);

      // Optimistic insert; the SSE echo (same mid) will reconcile.
      const synthetic: SSEChatEvent = {
        type: 'chat',
        mid,
        from_uid: myUid,
        created_at: Date.now(),
        target: gid !== undefined ? { gid } : { uid: uid as number },
        detail: { type: 'normal', content, content_type: 'text/markdown' },
      };
      useChatStore.getState().ingestEvent(synthetic, myUid);
    } catch {
      setDraft(content); // restore on failure
    } finally {
      setSending(false);
    }
  }, [draft, sending, gid, uid, myUid]);

  // Inverted list shows newest at the bottom, so reverse for rendering.
  const data = [...messages].reverse();

  return (
    <ThemedBackground>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={tokens.accent} />
          </View>
        ) : (
          <FlatList
            data={data}
            inverted
            keyExtractor={(m) => String(m.mid)}
            contentContainerStyle={styles.listContent}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.more} color={tokens.accent} /> : null}
            renderItem={({ item, index }) => {
              // data is newest-first; the "previous" (older) message is at index+1.
              const older = data[index + 1] as ChatMessage | undefined;
              const showHeader = !older || older.from_uid !== item.from_uid;
              return <MessageBubble message={item} myUid={myUid} showHeader={showHeader} />;
            }}
          />
        )}

        <View
          style={[
            styles.inputBar,
            { backgroundColor: tokens.navbarBg, borderColor: tokens.border, paddingBottom: insets.bottom || 8 },
          ]}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor={tokens.textMuted}
            multiline
            style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.lg, fontFamily: font(400) }]}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || sending}
            style={[styles.sendBtn, { backgroundColor: tokens.accent, borderRadius: radius.full, opacity: !draft.trim() || sending ? 0.5 : 1 }]}
          >
            <Text style={[styles.sendText, { color: tokens.accentFg, fontFamily: font(700) }]}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingVertical: 10 },
  more: { marginVertical: 10 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 120, minHeight: 42, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  sendBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontSize: 18 },
});
