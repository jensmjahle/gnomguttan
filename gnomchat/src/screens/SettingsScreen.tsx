import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { useAuth } from '@/hooks/useAuth';
import type { RootStackParamList } from '@/navigation/types';

// Both the chat and gallery stacks register a "Themes" route, so typing the
// navigation with either list is safe at runtime.
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const { tokens, font } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { logout, user } = useAuth();

  return (
    <ThemedBackground>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {user ? (
          <Text style={[styles.signedIn, { color: tokens.textMuted, fontFamily: font(500) }]}>
            Innlogget som {user.name}
          </Text>
        ) : null}

        <View style={[styles.group, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('Themes')}
            android_ripple={{ color: tokens.bgHover }}
          >
            <Ionicons name="color-palette-outline" size={20} color={tokens.textSecondary} />
            <Text style={[styles.rowLabel, { color: tokens.textPrimary, fontFamily: font(600) }]}>Utseende</Text>
            <Ionicons name="chevron-forward" size={18} color={tokens.textMuted} />
          </Pressable>
        </View>

        <View style={[styles.group, { backgroundColor: tokens.bgCard, borderColor: tokens.border }]}>
          <Pressable style={styles.row} onPress={logout} android_ripple={{ color: tokens.bgHover }}>
            <Ionicons name="log-out-outline" size={20} color={tokens.error} />
            <Text style={[styles.rowLabel, { color: tokens.error, fontFamily: font(600) }]}>Logg ut</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  signedIn: { fontSize: 13, paddingHorizontal: 4 },
  group: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { flex: 1, fontSize: 15 },
});
