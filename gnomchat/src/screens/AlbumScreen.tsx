import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Linking, Alert } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { MediaGrid, type MediaItem } from '@/components/MediaGrid';
import {
  albumDownloadUrl,
  albumMediaFileUrl,
  deleteAlbumMedia,
  loadAlbum,
  uploadAssetsToAlbum,
  type AlbumUploadProgress,
  type UploadableAsset,
} from '@/services/albums';
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
  const insets = useSafeAreaInsets();
  const route = useRoute<AlbumRoute>();
  const { albumId } = route.params;
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<AlbumUploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
        downloadUrl: albumMediaFileUrl(media.id, { download: true }),
      })),
    [album],
  );

  const uploading = uploadProgress !== null;

  async function handleUpload() {
    if (uploading) return;
    setUploadError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;

    const assets: UploadableAsset[] = result.assets.map((asset) => {
      const type: 'image' | 'video' = asset.type === 'video' ? 'video' : 'image';
      return {
        uri: asset.uri,
        fileName: asset.fileName ?? (type === 'video' ? 'video.mp4' : 'photo.jpg'),
        mimeType: asset.mimeType ?? (type === 'video' ? 'video/mp4' : 'image/jpeg'),
        type,
      };
    });

    setUploadProgress({ done: 0, total: assets.length, fraction: 0 });
    try {
      await uploadAssetsToAlbum(albumId, assets, setUploadProgress);
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Kunne ikke laste opp.');
    } finally {
      setUploadProgress(null);
    }
  }

  function handleDownload() {
    void Linking.openURL(albumDownloadUrl(albumId));
  }

  const selectionMode = selected.size > 0;

  function enterSelection(item: MediaItem) {
    setSelected(new Set([item.key]));
  }

  function toggleSelect(item: MediaItem) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function handleDownloadSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    void Linking.openURL(albumDownloadUrl(albumId, ids));
  }

  async function deleteSelected() {
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => deleteAlbumMedia(albumId, id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    setUploadError(failed > 0 ? `Kunne ikke slette ${failed} av ${ids.length}.` : null);
    clearSelection();
    await load();
  }

  function handleDeleteSelected() {
    const count = selected.size;
    if (count === 0) return;
    Alert.alert(
      'Slette',
      `Slette ${count} ${count === 1 ? 'element' : 'elementer'}? Dette kan ikke angres.`,
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Slett', style: 'destructive', onPress: () => void deleteSelected() },
      ],
    );
  }

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
      {uploadError ? (
        <Text style={[styles.meta, { color: tokens.error, fontFamily: font(500) }]}>{uploadError}</Text>
      ) : null}
    </View>
  ) : null;

  const empty = (
    <View style={styles.center}>
      <Text style={[styles.stateText, { color: tokens.textMuted, fontFamily: font(500) }]}>Ingen bilder i albumet enda.</Text>
    </View>
  );

  const hasMedia = (album?.mediaCount ?? 0) > 0;

  return (
    <ThemedBackground>
      <View style={styles.fill}>
        <MediaGrid
          items={items}
          header={header}
          empty={empty}
          refreshing={loading}
          onRefresh={() => void load()}
          bottomInset={72}
          selectable
          selectedKeys={selected}
          onLongPressItem={enterSelection}
          onToggleSelect={toggleSelect}
        />

        {/* Floating action bar */}
        <View style={[styles.floatingBar, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
          {selectionMode ? (
            <View style={[styles.barInner, { backgroundColor: tokens.navbarBg, borderColor: tokens.border }]}>
              <Pressable style={styles.barBtn} onPress={clearSelection}>
                <Ionicons name="close" size={20} color={tokens.textSecondary} />
                <Text style={[styles.barBtnText, { color: tokens.textPrimary, fontFamily: font(600) }]}>{selected.size} valgt</Text>
              </Pressable>
              <View style={[styles.barDivider, { backgroundColor: tokens.border }]} />
              <Pressable style={styles.barBtn} onPress={handleDownloadSelected}>
                <Ionicons name="download-outline" size={20} color={tokens.accent} />
                <Text style={[styles.barBtnText, { color: tokens.textPrimary, fontFamily: font(600) }]}>Last ned</Text>
              </Pressable>
              <View style={[styles.barDivider, { backgroundColor: tokens.border }]} />
              <Pressable style={styles.barBtn} onPress={handleDeleteSelected}>
                <Ionicons name="trash-outline" size={20} color={tokens.error} />
                <Text style={[styles.barBtnText, { color: tokens.error, fontFamily: font(600) }]}>Slett</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.barInner, { backgroundColor: tokens.navbarBg, borderColor: tokens.border }]}>
              <Pressable style={styles.barBtn} onPress={() => void handleUpload()} disabled={uploading}>
                {uploading ? (
                  <ActivityIndicator size="small" color={tokens.accent} />
                ) : (
                  <Ionicons name="cloud-upload-outline" size={20} color={tokens.accent} />
                )}
                <Text style={[styles.barBtnText, { color: tokens.textPrimary, fontFamily: font(600) }]}>
                  {uploading && uploadProgress
                    ? `Laster opp ${Math.min(uploadProgress.done + 1, uploadProgress.total)}/${uploadProgress.total}`
                    : 'Last opp'}
                </Text>
              </Pressable>

              {hasMedia && (
                <>
                  <View style={[styles.barDivider, { backgroundColor: tokens.border }]} />
                  <Pressable style={styles.barBtn} onPress={handleDownload}>
                    <Ionicons name="download-outline" size={20} color={tokens.accent} />
                    <Text style={[styles.barBtnText, { color: tokens.textPrimary, fontFamily: font(600) }]}>Last ned album</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
        </View>
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
  floatingBar: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  barInner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  barBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  barBtnText: { fontSize: 14 },
  barDivider: { width: 1, alignSelf: 'stretch', marginVertical: 8 },
});
