import { useMemo, useState, type ReactElement } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  Linking,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';

export interface MediaItem {
  key: string;
  type: 'image' | 'video';
  thumbUrl: string;
  fullUrl: string;
}

const COLUMNS = 3;

interface Props {
  items: MediaItem[];
  header?: ReactElement | null;
  empty?: ReactElement | null;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function MediaGrid({ items, header, empty, refreshing, onRefresh }: Props) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const cellSize = Math.floor(width / COLUMNS);
  const images = useMemo(() => items.filter((item) => item.type === 'image'), [items]);

  function onPressItem(item: MediaItem) {
    if (item.type === 'video') {
      void Linking.openURL(item.fullUrl);
      return;
    }
    const index = images.findIndex((im) => im.key === item.key);
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
        contentContainerStyle={{ paddingBottom: insets.bottom + 8, flexGrow: 1 }}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={tokens.accent} /> : undefined
        }
        renderItem={({ item }) => (
          <Pressable style={{ width: cellSize, height: cellSize, padding: 1 }} onPress={() => onPressItem(item)}>
            <Image source={{ uri: item.thumbUrl }} style={styles.thumb} contentFit="cover" transition={120} recyclingKey={item.key} />
            {item.type === 'video' && (
              <View style={styles.playBadge}>
                <Ionicons name="play" size={12} color="#fff" />
              </View>
            )}
          </Pressable>
        )}
      />

      {viewerIndex !== null && images[viewerIndex] && (
        <ImageViewer images={images} index={viewerIndex} onIndexChange={setViewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </>
  );
}

function ImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: MediaItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const item = images[index];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewerBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Image source={{ uri: item.fullUrl }} style={styles.viewerImage} contentFit="contain" transition={150} />

        <Pressable onPress={onClose} hitSlop={12} style={[styles.viewerBtn, styles.viewerClose, { top: insets.top + 8 }]}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        {index > 0 && (
          <Pressable onPress={() => onIndexChange(index - 1)} hitSlop={12} style={[styles.viewerBtn, styles.viewerNavLeft]}>
            <Ionicons name="chevron-back" size={30} color="#fff" />
          </Pressable>
        )}
        {index < images.length - 1 && (
          <Pressable onPress={() => onIndexChange(index + 1)} hitSlop={12} style={[styles.viewerBtn, styles.viewerNavRight]}>
            <Ionicons name="chevron-forward" size={30} color="#fff" />
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  thumb: { flex: 1, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)' },
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
  viewerImage: { width: '100%', height: '100%' },
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
  viewerNavLeft: { left: 12, top: '50%', marginTop: -20 },
  viewerNavRight: { right: 12, top: '50%', marginTop: -20 },
});
