import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { vocechatService } from '@/services/vocechat';
import { useTheme } from '@/theme/useTheme';

interface GroupAvatarProps {
  gid: number;
  avatarUpdatedAt?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** Channel avatar: shows the group image, falling back to a "#" behind it. */
export function GroupAvatar({ gid, avatarUpdatedAt, size = 40, style }: GroupAvatarProps) {
  const { tokens, font } = useTheme();
  const radius = size / 2;

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: radius, backgroundColor: tokens.accentMuted },
        style,
      ]}
    >
      <Text style={[styles.fallback, { color: tokens.accent, fontFamily: font(700), fontSize: size * 0.5 }]}>#</Text>
      {/* group_avatar 404s when a channel has no image — expo-image then shows
          nothing and the "#" fallback remains visible. */}
      <Image
        source={{ uri: vocechatService.groupAvatarUrl(gid, avatarUpdatedAt) }}
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
