import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { MediaGrid, type MediaItem } from '@/components/MediaGrid';
import { albumMediaFileUrl, loadAlbum } from '@/services/albums';
import type { Album } from '@/types';
import type { GalleryStackParamList } from '@/navigation/types';

type AlbumRoute = RouteProp<GalleryStackParamList, 'Album'>;

const MONTHS_NB = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

function formatDateNb(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()}. ${MONTHS_NB[d.getMonth()]} ${d.getFullYear()}`;
}

export function AlbumScreen() {
  const { tokens, font } = useTheme();
  const route = useRoute<AlbumRoute>();
  const { albumId } = route.params;
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAlbum(await loadAlbum(albumId));
    } catch {
      setError('Kunne ikke laste albumet.');
    } finally {
      setLoading(false);
    }
  }, [albumId]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo<MediaItem[]>(
    () =>
      (album?.media ?? []).map((media) => ({
        key: media.id,
        type: media.type,
        thumbUrl: albumMediaFileUrl(media.id, { thumbnail: true }),
        fullUrl: albumMediaFileUrl(media.id),
      })),
    [album],
  );

  if (loading && !album) {
    return (
      <ThemedBackground>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.accent} />
        </View>
      </ThemedBackground>
    );
  }

  if (error && !album) {
    return (
      <ThemedBackground>
        <View style={styles.center}>
          <Text style={[styles.stateText, { color: tokens.textMuted, fontFamily: font(500) }]}>{error}</Text>
          <Pressable onPress={() => void load()} style={[styles.retryBtn, { borderColor: tokens.border }]}>
            <Text style={{ color: tokens.accent, fontFamily: font(600) }}>Prøv igjen</Text>
          </Pressable>
        </View>
      </ThemedBackground>
    );
  }

  const header = album ? (
    <View style={styles.header}>
      {album.description ? (
        <Text style={[styles.description, { color: tokens.textSecondary, fontFamily: font(400) }]}>{album.description}</Text>
      ) : null}
      <Text style={[styles.meta, { color: tokens.textMuted, fontFamily: font(500) }]}>
        {formatDateNb(album.createdAt)} ·{' '}
        {album.mediaCount === 1 ? '1 element' : `${album.mediaCount} elementer`}
      </Text>
    </View>
  ) : null;

  const empty = (
    <View style={styles.center}>
      <Text style={[styles.stateText, { color: tokens.textMuted, fontFamily: font(500) }]}>Ingen bilder i albumet enda.</Text>
    </View>
  );

  return (
    <ThemedBackground>
      <View style={styles.fill}>
        <MediaGrid items={items} header={header} empty={empty} refreshing={loading} onRefresh={() => void load()} />
      </View>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, minHeight: 160 },
  stateText: { fontSize: 14, textAlign: 'center' },
  retryBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  header: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, gap: 6 },
  description: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 12 },
});
