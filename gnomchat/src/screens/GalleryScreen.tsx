import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { MediaGrid, type MediaItem } from '@/components/MediaGrid';
import { useVoceChatGallery } from '@/hooks/useVoceChatGallery';
import { vocechatService } from '@/services/vocechat';
import { albumMediaFileUrl, loadAlbums, loadGalleryAlbumMedia } from '@/services/albums';
import type { AlbumMedia, AlbumSummary } from '@/types';
import type { GalleryStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<GalleryStackParamList, 'Gallery'>;

export function GalleryScreen() {
  const { tokens, font } = useTheme();
  const navigation = useNavigation<Nav>();
  const { files, loading: filesLoading, refresh: refreshFiles } = useVoceChatGallery();
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [albumMedia, setAlbumMedia] = useState<AlbumMedia[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(true);

  const loadAlbumData = useCallback(async () => {
    setAlbumsLoading(true);
    try {
      const [albumList, media] = await Promise.all([loadAlbums(), loadGalleryAlbumMedia()]);
      setAlbums(albumList);
      setAlbumMedia(media);
    } catch {
      // Album backend may be unreachable — keep the VoceChat photo grid working.
    } finally {
      setAlbumsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAlbumData();
  }, [loadAlbumData]);

  const stream = useMemo<MediaItem[]>(() => {
    const combined: Array<{ ts: number; item: MediaItem }> = [
      ...files.map((file) => ({
        ts: file.created_at,
        item: {
          key: `vc-${file.mid}`,
          type: 'image' as const,
          thumbUrl: vocechatService.resourceFileUrl(file.thumbnail || file.content),
          fullUrl: vocechatService.resourceFileUrl(file.content),
        },
      })),
      ...albumMedia.map((media) => ({
        ts: media.createdAt,
        item: {
          key: `am-${media.id}`,
          type: media.type,
          thumbUrl: albumMediaFileUrl(media.id, { thumbnail: true }),
          fullUrl: albumMediaFileUrl(media.id),
        },
      })),
    ];
    combined.sort((a, b) => b.ts - a.ts);
    return combined.map((entry) => entry.item);
  }, [files, albumMedia]);

  const refreshAll = useCallback(() => {
    void refreshFiles();
    void loadAlbumData();
  }, [refreshFiles, loadAlbumData]);

  const loading = filesLoading || albumsLoading;

  const header = (
    <View>
      {albums.length > 0 && (
        <View style={styles.albumSection}>
          <Text style={[styles.sectionTitle, { color: tokens.textMuted, fontFamily: font(600) }]}>Album</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumRow}>
            {albums.map((album) => (
              <AlbumCard
                key={album.id}
                album={album}
                onPress={() => navigation.navigate('Album', { albumId: album.id, title: album.title })}
              />
            ))}
          </ScrollView>
        </View>
      )}
      {(albums.length > 0 || stream.length > 0) && (
        <Text style={[styles.sectionTitle, styles.streamTitle, { color: tokens.textMuted, fontFamily: font(600) }]}>
          Alle bilder
        </Text>
      )}
    </View>
  );

  const empty =
    loading && stream.length === 0 ? (
      <View style={styles.center}>
        <ActivityIndicator color={tokens.accent} />
        <Text style={[styles.stateText, { color: tokens.textMuted, fontFamily: font(500) }]}>Henter bilder…</Text>
      </View>
    ) : (
      <View style={styles.center}>
        <Text style={[styles.stateText, { color: tokens.textMuted, fontFamily: font(500) }]}>Ingen bilder funnet.</Text>
      </View>
    );

  return (
    <ThemedBackground>
      <View style={styles.fill}>
        <MediaGrid items={stream} header={header} empty={empty} refreshing={loading} onRefresh={refreshAll} />
      </View>
    </ThemedBackground>
  );
}

function AlbumCard({ album, onPress }: { album: AlbumSummary; onPress: () => void }) {
  const { tokens, font } = useTheme();
  const coverId = album.coverMediaIds[0];

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {coverId ? (
        <Image
          source={{ uri: albumMediaFileUrl(coverId, { thumbnail: true }) }}
          style={[styles.cardCover, { borderColor: tokens.border }]}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View style={[styles.cardCover, styles.cardCoverEmpty, { borderColor: tokens.border, backgroundColor: tokens.bgSecondary }]}>
          <Text style={{ color: tokens.textMuted, fontFamily: font(500), fontSize: 11 }}>Tomt</Text>
        </View>
      )}
      <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.textPrimary, fontFamily: font(600) }]}>
        {album.title}
      </Text>
      <Text style={[styles.cardMeta, { color: tokens.textMuted, fontFamily: font(400) }]}>
        {album.mediaCount === 1 ? '1 element' : `${album.mediaCount} elementer`}
        {album.eventId ? ' · arrangement' : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, minHeight: 160 },
  stateText: { fontSize: 14, textAlign: 'center' },
  albumSection: { paddingTop: 10 },
  sectionTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, paddingHorizontal: 10, paddingBottom: 8 },
  streamTitle: { paddingTop: 12 },
  albumRow: { paddingHorizontal: 10, gap: 12 },
  card: { width: 128 },
  cardCover: { width: 128, height: 128, borderRadius: 10, borderWidth: 1 },
  cardCoverEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 13, marginTop: 6 },
  cardMeta: { fontSize: 11, marginTop: 2 },
});
