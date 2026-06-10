import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { THEME_TOKENS } from '@/theme/themeTokens.generated';

export function ThemeScreen() {
  const { themeId, themes, setTheme, tokens, font, radius } = useTheme();

  return (
    <ThemedBackground>
      <FlatList
        data={themes}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const swatch = THEME_TOKENS[item.id];
          const active = item.id === themeId;
          return (
            <Pressable
              onPress={() => setTheme(item.id)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? tokens.bgHover : tokens.bgCard,
                  borderColor: active ? tokens.accent : tokens.border,
                  borderRadius: radius.md,
                  borderWidth: active ? 2 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View style={styles.swatches}>
                <View style={[styles.swatch, { backgroundColor: swatch.bgPrimary }]} />
                <View style={[styles.swatch, { backgroundColor: swatch.accent }]} />
                <View style={[styles.swatch, { backgroundColor: swatch.bgCard }]} />
              </View>
              <View style={styles.meta}>
                <Text style={[styles.label, { color: tokens.textPrimary, fontFamily: font(600) }]}>{item.label}</Text>
                <Text style={[styles.desc, { color: tokens.textSecondary, fontFamily: font(400) }]}>{item.description}</Text>
              </View>
              {active && <Text style={[styles.check, { color: tokens.accent, fontFamily: font(700) }]}>✓</Text>}
            </Pressable>
          );
        }}
      />
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 },
  swatches: { flexDirection: 'row' },
  swatch: { width: 22, height: 36, marginLeft: -6, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.15)' },
  meta: { flex: 1 },
  label: { fontSize: 16 },
  desc: { fontSize: 13 },
  check: { fontSize: 20 },
});
