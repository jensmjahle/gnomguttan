import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { MediaGrid, type MediaItem } from '@/components/MediaGrid';
import { ObligationBanner } from '@/components/ObligationBanner';
import { Button, Empty, ErrorBox, T } from '@/components/ui';
import { qk } from '@/data/queryClient';
import { albumMediaFileUrl, loadAlbums, loadGalleryAlbumMedia } from '@/services/albums';
import { archivedMediaUrl, listArchivedMedia } from '@/services/archive';
import { errorText } from '@/services/appApi';

/** Galleri: albums, and every photo and video from albums and the old chat, newest first. */
export function GalleryScreen() {
  const { tokens, radius } = useTheme();
  const navigation = useNavigation();
  const albums = useQuery({ queryKey: qk.albums, queryFn: loadAlbums });
  const albumMedia = useQuery({ queryKey: qk.albumMedia, queryFn: loadGalleryAlbumMedia });
  const archive = useQuery({ queryKey: qk.archive('all', 'image'), queryFn: () => listArchivedMedia({ kind: 'image' }) });

  const stream = useMemo<MediaItem[]>(() => {
    const combined = [
      ...(archive.data ?? []).map((file) => ({
        ts: file.createdAt,
        item: { key: `vc-${file.id}`, type: 'image' as const, thumbUrl: archivedMediaUrl(file.id, { thumbnail: true }), fullUrl: archivedMediaUrl(file.id), downloadUrl: archivedMediaUrl(file.id, { download: true }) },
      })),
      ...(albumMedia.data ?? []).map((media) => ({
        ts: media.createdAt,
        item: { key: `am-${media.id}`, type: media.type, thumbUrl: albumMediaFileUrl(media.id, { thumbnail: true }), fullUrl: albumMediaFileUrl(media.id), downloadUrl: albumMediaFileUrl(media.id, { download: true }) },
      })),
    ];
    combined.sort((a, b) => b.ts - a.ts);
    return combined.map((entry) => entry.item);
  }, [archive.data, albumMedia.data]);

  const refresh = () => { void albums.refetch(); void albumMedia.refetch(); void archive.refetch(); };
  const error = albums.error && !albums.data ? errorText(albums.error, 'Kunne ikke hente album.') : '';

  const header = (
    <View style={{ gap: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 }}>
      <ObligationBanner />
      <ErrorBox message={error} onRetry={refresh} />
      <View style={styles.headRow}>
        <T weight={800} size={20} style={{ flex: 1 }}>Album</T>
        <Button small variant="secondary" icon="archive-outline" title="Arkiv" onPress={() => navigation.navigate('Archive')} />
        <Button small icon="add" title="Nytt album" onPress={() => navigation.navigate('AlbumEditor')} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {(albums.data ?? []).map((album) => (
          <Pressable key={album.id} onPress={() => navigation.navigate('Album', { albumId: album.id, title: album.title })} style={[styles.album, { backgroundColor: tokens.bgCard, borderRadius: radius.md, borderColor: tokens.border }]}>
            {(album.coverMediaId ?? album.coverMediaIds?.[0]) ? (
              <Image source={{ uri: albumMediaFileUrl((album.coverMediaId ?? album.coverMediaIds[0])!, { thumbnail: true }) }} style={[styles.cover, { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md }]} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <View style={[styles.cover, { alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.bgSecondary }]}><Ionicons name="images-outline" size={28} color={tokens.textMuted} /></View>
            )}
            <View style={{ padding: 8 }}>
              <T weight={700} size={13} numberOfLines={1}>{album.title}</T>
              <T size={11} muted>{album.mediaCount} filer</T>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <T weight={800} size={20}>Alle bilder</T>
    </View>
  );

  return (
    <ThemedBackground>
      <MediaGrid
        items={stream}
        header={header}
        empty={albums.isLoading || albumMedia.isLoading ? null : <Empty icon="images-outline" title="Ingen bilder ennå" text="Lag et album og last opp bilder fra arrangementene." />}
        refreshing={albums.isRefetching || albumMedia.isRefetching}
        onRefresh={refresh}
      />
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  album: { width: 140, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cover: { width: 140, height: 100 },
});
