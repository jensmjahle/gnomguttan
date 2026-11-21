import { useState } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { authedUrl } from '@/services/appApi';
import { useTheme } from '@/theme/useTheme';

interface AvatarProps {
  uid: number;
  name?: string;
  avatarUpdatedAt?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** A profile picture from our own server; initials when there is none. Cached per version. */
export function Avatar({ uid, name, avatarUpdatedAt, size = 40, style }: AvatarProps) {
  const { tokens, font } = useTheme();
  const [failed, setFailed] = useState(false);
  const initials = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  const radius = size / 2;
  const showImage = uid > 0 && !failed;

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: radius, backgroundColor: tokens.accentMuted }, style]}>
      <Text style={{ color: tokens.accent, fontFamily: font(600), fontSize: size * 0.4 }}>{initials}</Text>
      {showImage ? (
        <Image
          source={{ uri: authedUrl(`/avatars/${uid}`, { v: String(avatarUpdatedAt ?? 0) }), cacheKey: `avatar-${uid}-${avatarUpdatedAt ?? 0}` }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
