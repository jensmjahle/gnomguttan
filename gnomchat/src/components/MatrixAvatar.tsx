import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme/useTheme';
import { useMatrixMobileStore } from '@/store/matrixMobileStore';

export function MatrixAvatar({ name, mxc, size = 40 }: { name: string; mxc?: string; size?: number }) {
  const { tokens, font } = useTheme();
  const session = useMatrixMobileStore(s => s.session);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [mxc]);
  const match = mxc?.match(/^mxc:\/\/([^/]+)\/(.+)$/);
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (match && session && !failed) return <Image source={{ uri: `${session.baseUrl}/_matrix/client/v1/media/thumbnail/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}?width=96&height=96&method=crop`, headers: { Authorization: `Bearer ${session.accessToken}` } }}
    style={style} contentFit="cover" onError={() => setFailed(true)} />;
  return <View style={[style, { backgroundColor: tokens.bgSecondary, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: tokens.accent, fontFamily: font(700), fontSize: size * 0.45 }}>{name.slice(0, 1).toUpperCase()}</Text></View>;
}
