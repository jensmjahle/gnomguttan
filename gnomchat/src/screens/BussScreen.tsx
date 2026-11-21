import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '@/theme/useTheme';
import { config } from '@/config';

/** Buss: Entur's live departure board (the website embeds the same board). */
export function BussScreen() {
  const { tokens } = useTheme();
  const [loading, setLoading] = useState(true);
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bgPrimary }}>
      <WebView source={{ uri: config.busUrl }} onLoadEnd={() => setLoading(false)} style={{ flex: 1, backgroundColor: 'transparent' }} setSupportMultipleWindows={false} />
      {loading ? <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={tokens.accent} /></View> : null}
    </View>
  );
}
