import { useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { qk } from '@/data/queryClient';
import { archivedMediaUrl, listArchivedGroups, listArchivedMedia, type ArchivedMediaKind } from '@/services/archive';
import { MediaGrid } from '@/components/MediaGrid';
import { Chip, Empty, ErrorBox, Loading, T } from '@/components/ui';
import { errorText } from '@/services/appApi';
import { useAppUsers } from '@/data/users';

const KINDS: Array<{ kind: ArchivedMediaKind; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { kind: 'image', label: 'Bilder', icon: 'image-outline' },
  { kind: 'video', label: 'Video', icon: 'videocam-outline' },
  { kind: 'audio', label: 'Lyd', icon: 'musical-notes-outline' },
  { kind: 'pdf', label: 'PDF', icon: 'document-text-outline' },
  { kind: 'doc', label: 'Dokumenter', icon: 'document-outline' },
  { kind: 'file', label: 'Andre filer', icon: 'attach-outline' },
];

const sizeLabel = (size: number | null) => (size ? (size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.round(size / 1024)} KB`) : '');

/** Arkiv: everything that was shared in the old VoceChat channels, kept on our server. */
export function ArchiveScreen() {
  const { tokens, radius } = useTheme();
  const [kind, setKind] = useState<ArchivedMediaKind>('image');
  const [gid, setGid] = useState<number | undefined>(undefined);
  const groups = useQuery({ queryKey: qk.archiveGroups, queryFn: listArchivedGroups, staleTime: 3600_000 });
  const media = useQuery({ queryKey: qk.archive(String(gid ?? 'all'), kind), queryFn: () => listArchivedMedia({ kind, gid }) });
  const { data: users = [] } = useAppUsers();
  const nameOf = (uid: number) => users.find((user) => user.uid === uid)?.name ?? 'Ukjent';
  const items = useMemo(() => media.data ?? [], [media.data]);

  const filters = (
    <View style={{ gap: 8, padding: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {KINDS.map((option) => <Chip key={option.kind} icon={option.icon} label={option.label} selected={kind === option.kind} onPress={() => setKind(option.kind)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <Chip label="Alle kanaler" selected={gid === undefined} onPress={() => setGid(undefined)} />
        {(groups.data ?? []).map((group) => <Chip key={group.gid} label={`#${group.name}`} selected={gid === group.gid} onPress={() => setGid(group.gid)} />)}
      </ScrollView>
      <ErrorBox message={media.error && !media.data ? errorText(media.error) : ''} onRetry={() => void media.refetch()} />
      {media.isLoading && !media.data ? <Loading /> : null}
    </View>
  );

  if (kind === 'image' || kind === 'video') {
    return (
      <ThemedBackground>
        <MediaGrid
          header={filters}
          items={items.map((file) => ({ key: file.id, type: file.kind === 'video' ? 'video' : 'image', thumbUrl: archivedMediaUrl(file.id, { thumbnail: true }), fullUrl: archivedMediaUrl(file.id), downloadUrl: archivedMediaUrl(file.id, { download: true }) }))}
          empty={media.isLoading ? null : <Empty icon="archive-outline" title="Ingenting her" />}
          refreshing={media.isRefetching}
          onRefresh={() => void media.refetch()}
        />
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={filters}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={media.isLoading ? null : <Empty icon="archive-outline" title="Ingenting her" />}
        renderItem={({ item }) => (
          <Pressable onPress={() => void Linking.openURL(archivedMediaUrl(item.id, { download: true }))} style={[styles.file, { backgroundColor: tokens.bgCard, borderRadius: radius.md, borderColor: tokens.border }]}>
            <Ionicons name={KINDS.find((option) => option.kind === item.kind)?.icon ?? 'document-outline'} size={24} color={tokens.accent} />
            <View style={{ flex: 1 }}>
              <T weight={600} numberOfLines={1}>{item.name}</T>
              <T size={12} muted>{nameOf(item.fromUid)} · {item.groupName ? `#${item.groupName} · ` : ''}{new Date(item.createdAt).toLocaleDateString('nb-NO')} {sizeLabel(item.size)}</T>
            </View>
            <Ionicons name="download-outline" size={20} color={tokens.textMuted} />
          </Pressable>
        )}
      />
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginHorizontal: 12, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth },
});
