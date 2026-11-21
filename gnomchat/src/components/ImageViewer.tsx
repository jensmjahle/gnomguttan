import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '@/components/ui';

/** Full-screen image with share/save. */
export function ImageViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      let local = uri;
      if (!uri.startsWith('file:')) {
        const target = `${FileSystem.cacheDirectory}share-${Date.now()}.jpg`;
        local = (await FileSystem.downloadAsync(uri, target)).uri;
      }
      await Sharing.shareAsync(local);
    } catch { /* cancelled */ } finally { setBusy(false); }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Image source={{ uri }} style={styles.image} contentFit="contain" cachePolicy="memory-disk" />
        <View style={[styles.bar, { top: insets.top + 8 }]}>
          <IconButton icon="share-outline" label="Del eller lagre" color="#fff" onPress={() => void share()} disabled={busy} />
          <IconButton icon="close" label="Lukk" color="#fff" size={26} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  image: { width: '100%', height: '80%' },
  bar: { position: 'absolute', right: 12, flexDirection: 'row', gap: 12 },
});
