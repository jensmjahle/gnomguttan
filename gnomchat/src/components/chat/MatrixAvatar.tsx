import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme/useTheme';
import { useMatrixMedia } from '@/matrix/media';
import type { MediaRef } from '@/matrix/protocol.generated';

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#14b8a6'];

export function MatrixAvatar({ name, avatar, size = 40, square }: { name: string; avatar?: MediaRef; size?: number; square?: boolean }) {
  const { font } = useTheme();
  const { uri } = useMatrixMedia(avatar, 96);
  const letter = (name.replace(/^[@#!]/, '').trim()[0] ?? '?').toUpperCase();
  const color = PALETTE[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % PALETTE.length];
  const radius = square ? size * 0.25 : size / 2;
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: radius, backgroundColor: color }]}>
      <Text style={{ color: '#fff', fontFamily: font(700), fontSize: size * 0.42 }}>{letter}</Text>
      {uri ? <Image source={{ uri }} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} contentFit="cover" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } });
