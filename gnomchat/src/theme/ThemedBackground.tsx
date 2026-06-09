import { type ReactNode } from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from './ThemeProvider';
import { BACKGROUND_IMAGES } from './themeTokens.generated';

// Maps a CSS gradient angle (0=up, 90=right, 180=down) to expo-linear-gradient
// start/end points on the unit square.
function angleToPoints(angle: number) {
  const rad = (angle * Math.PI) / 180;
  const x = Math.sin(rad);
  const y = -Math.cos(rad);
  return {
    start: { x: 0.5 - x / 2, y: 0.5 - y / 2 },
    end: { x: 0.5 + x / 2, y: 0.5 + y / 2 },
  };
}

/** Renders the active theme's background (solid / image / gradient) behind children. */
export function ThemedBackground({ children }: { children: ReactNode }) {
  const { tokens } = useTheme();
  const bg = tokens.bgImage;

  if (bg.type === 'image' && BACKGROUND_IMAGES[bg.asset]) {
    return (
      <ImageBackground
        source={BACKGROUND_IMAGES[bg.asset]}
        resizeMode="cover"
        style={[styles.fill, { backgroundColor: tokens.bgPrimary }]}
      >
        {children}
      </ImageBackground>
    );
  }

  if (bg.type === 'gradient' && bg.stops.length >= 2) {
    const { start, end } = angleToPoints(bg.angle);
    return (
      <LinearGradient colors={bg.stops as [string, string, ...string[]]} start={start} end={end} style={styles.fill}>
        {children}
      </LinearGradient>
    );
  }

  return <View style={[styles.fill, { backgroundColor: tokens.bgPrimary }]}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
