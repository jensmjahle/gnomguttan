import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { qk, queryClient } from '@/data/queryClient';
import { createOverheard, loadOverheard } from '@/services/services';
import { errorText } from '@/services/appApi';
import { Button, Card, Empty, ErrorBox, Field, T } from '@/components/ui';
import { Sheet } from '@/components/Sheet';

/** Overhørt: everything the gang has been overheard saying. */
export function QuotesScreen() {
  const { tokens, radius, font } = useTheme();
  const quotes = useQuery({ queryKey: qk.overheard, queryFn: loadOverheard });
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...(quotes.data ?? [])].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return q ? list.filter((quote) => `${quote.text} ${quote.author}`.toLowerCase().includes(q)) : list;
  }, [quotes.data, search]);

  const save = async () => {
    setBusy(true); setError('');
    try {
      await createOverheard({ text: text.trim(), author: author.trim() });
      setText(''); setAuthor(''); setOpen(false);
      void queryClient.invalidateQueries({ queryKey: qk.overheard });
      void queryClient.invalidateQueries({ queryKey: qk.feedAll });
    } catch (reason) { setError(errorText(reason, 'Kunne ikke lagre sitatet.')); }
    finally { setBusy(false); }
  };

  return (
    <ThemedBackground>
      <FlatList
        data={shown}
        keyExtractor={(quote) => quote.id}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput value={search} onChangeText={setSearch} placeholder={`Søk i ${quotes.data?.length ?? 0} sitater`} placeholderTextColor={tokens.textMuted} style={{ flex: 1, backgroundColor: tokens.bgSecondary, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9, color: tokens.textPrimary, fontFamily: font(400) }} />
              <Button small icon="add" title="Nytt" onPress={() => setOpen(true)} />
            </View>
            <ErrorBox message={quotes.error && !quotes.data ? errorText(quotes.error) : ''} onRetry={() => void quotes.refetch()} />
          </View>
        }
        renderItem={({ item }) => (
          <Card>
            <T size={17} style={{ fontStyle: 'italic' }}>«{item.text}»</T>
            <T size={13} muted>— {item.author}{item.createdBy ? ` · lagt inn av ${item.createdBy.name}` : ''}</T>
          </Card>
        )}
        ListEmptyComponent={quotes.isLoading ? null : <Empty icon="ear-outline" title="Ingen sitater" />}
        refreshControl={<RefreshControl refreshing={quotes.isRefetching} onRefresh={() => void quotes.refetch()} tintColor={tokens.accent} colors={[tokens.accent]} />}
      />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Nytt sitat">
        <Field label="Hva ble sagt?" value={text} onChangeText={setText} multiline maxLength={500} autoFocus />
        <Field label="Hvem sa det?" value={author} onChangeText={setAuthor} maxLength={80} />
        <ErrorBox message={error} />
        <Button title="Lagre sitat" busy={busy} disabled={!text.trim() || !author.trim()} onPress={() => void save()} />
      </Sheet>
    </ThemedBackground>
  );
}
