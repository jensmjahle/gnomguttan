import { useState, type ReactElement } from 'react';
import { View, StyleSheet, FlatList, Pressable, Modal, RefreshControl, Linking, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';

export interface MediaItem {
  key: string;
  type: 'image' | 'video';
  thumbUrl: string;
  fullUrl: string;
  downloadUrl?: string;
}

const COLUMNS = 3;

interface Props {
  items: MediaItem[];
  header?: ReactElement | null;
  empty?: ReactElement | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Extra space at the bottom of the list, e.g. to clear a floating action bar. */
  bottomInset?: number;
  /** Enables long-press multi-select. */
  selectable?: boolean;
  selectedKeys?: ReadonlySet<string>;
  onLongPressItem?: (item: MediaItem) => void;
  onToggleSelect?: (item: MediaItem) => void;
}

export function MediaGrid({
  items,
  header,
  empty,
  refreshing,
  onRefresh,
  bottomInset = 0,
  selectable = false,
  selectedKeys,
  onLongPressItem,
  onToggleSelect,
}: Props) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const cellSize = Math.floor(width / COLUMNS);
  const selectionActive = (selectedKeys?.size ?? 0) > 0;

  function onPressItem(item: MediaItem) {
    const index = items.findIndex((i) => i.key === item.key);
    if (index >= 0) setViewerIndex(index);
  }

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        numColumns={COLUMNS}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: insets.bottom + 8 + bottomInset, flexGrow: 1 }}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={tokens.accent} /> : undefined
        }
        renderItem={({ item }) => {
          const selected = selectedKeys?.has(item.key) ?? false;
          return (
            <Pressable
              style={{ width: cellSize, height: cellSize, padding: 1 }}
              onPress={() => (selectionActive ? onToggleSelect?.(item) : onPressItem(item))}
              onLongPress={selectable ? () => onLongPressItem?.(item) : undefined}
              delayLongPress={250}
            >
              <Image
                source={{ uri: item.thumbUrl }}
                style={[styles.thumb, selected && styles.thumbSelected]}
                contentFit="cover"
                transition={120}
                recyclingKey={item.key}
              />
              {item.type === 'video' && (
                <View style={styles.playBadge}>
                  <Ionicons name="play" size={12} color="#fff" />
                </View>
              )}
              {selectionActive && (
                <View style={styles.selectMark}>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={22} color={tokens.accent} />
                  ) : (
                    <View style={styles.selectEmpty} />
                  )}
                </View>
              )}
            </Pressable>
          );
        }}
      />

      {viewerIndex !== null && items[viewerIndex] && (
        <MediaViewer items={items} index={viewerIndex} onIndexChange={setViewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </>
  );
}

function MediaViewer({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: MediaItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const item = items[index];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewerBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {item.type === 'video' ? (
          <VideoSlide key={item.key} url={item.fullUrl} />
        ) : (
          <Image key={item.key} source={{ uri: item.fullUrl }} style={styles.viewerMedia} contentFit="contain" transition={150} />
        )}

        <Pressable
          onPress={() => void Linking.openURL(item.downloadUrl ?? item.fullUrl)}
          hitSlop={12}
          style={[styles.viewerBtn, styles.viewerDownload, { top: insets.top + 8 }]}
          accessibilityLabel="Last ned"
        >
          <Ionicons name="download-outline" size={24} color="#fff" />
        </Pressable>

        <Pressable onPress={onClose} hitSlop={12} style={[styles.viewerBtn, styles.viewerClose, { top: insets.top + 8 }]}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        {index > 0 && (
          <Pressable onPress={() => onIndexChange(index - 1)} hitSlop={12} style={[styles.viewerBtn, styles.viewerNavLeft]}>
            <Ionicons name="chevron-back" size={30} color="#fff" />
          </Pressable>
        )}
        {index < items.length - 1 && (
          <Pressable onPress={() => onIndexChange(index + 1)} hitSlop={12} style={[styles.viewerBtn, styles.viewerNavRight]}>
            <Ionicons name="chevron-forward" size={30} color="#fff" />
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

function VideoSlide({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });

  return <VideoView player={player} style={styles.viewerMedia} contentFit="contain" nativeControls allowsFullscreen />;
}

const styles = StyleSheet.create({
  thumb: { flex: 1, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)' },
  thumbSelected: { opacity: 0.7 },
  selectMark: { position: 'absolute', top: 5, left: 5 },
  selectEmpty: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  playBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  viewerMedia: { width: '100%', height: '100%' },
  viewerBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: { right: 16 },
  viewerDownload: { right: 64 },
  viewerNavLeft: { left: 12, top: '50%', marginTop: -20 },
  viewerNavRight: { right: 12, top: '50%', marginTop: -20 },
});
