import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { vocechatService } from '@/services/vocechat';
import { useTheme } from '@/theme/useTheme';

interface AvatarProps {
  uid: number;
  name?: string;
  avatarUpdatedAt?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function Avatar({ uid, name, avatarUpdatedAt, size = 40, style }: AvatarProps) {
  const { tokens, font } = useTheme();
  const initials = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  const radius = size / 2;

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: radius, backgroundColor: tokens.accentMuted },
        style,
      ]}
    >
      <Text style={[styles.fallback, { color: tokens.accent, fontFamily: font(600), fontSize: size * 0.4 }]}>
        {initials}
      </Text>
      <Image
        source={{ uri: vocechatService.avatarUrl(uid, avatarUpdatedAt) }}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        contentFit="cover"
        transition={120}
        cachePolicy="memory-disk"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fallback: { textAlign: 'center' },
});
