import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, Linking, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { useAuth } from '@/hooks/useAuth';
import type { RootStackParamList } from '@/navigation/types';
import { useMatrixMobileStore } from '@/store/matrixMobileStore';
import { matrixCall, logoutMatrix } from '@/services/matrix';

// Both the chat and gallery stacks register a "Themes" route, so typing the
// navigation with either list is safe at runtime.
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const { tokens, font } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { logout, user } = useAuth();
  const matrixUser = useMatrixMobileStore(s => s.userId);
  const notificationError = useMatrixMobileStore(s => s.notificationError);
  const verification = useMatrixMobileStore(s => s.verification);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  async function action(operation: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setResult('');
    try { await operation(); }
    catch (error) { setResult(error instanceof Error ? error.message : 'Matrix-operasjonen feilet.'); }
    finally { setBusy(false); }
  }
  const verify = (value: string) => void action(() => matrixCall('verify', { action: value }));

  return (
    <ThemedBackground>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={{ color: tokens.textPrimary }}>Matrix: {matrixUser || 'Ikke innlogget'}</Text>
        {matrixUser && <View style={[styles.group, { backgroundColor: tokens.bgCard, borderColor: tokens.border, padding: 16, gap: 12 }]}>
          <Pressable disabled={busy} onPress={() => verify('request')}><Text style={{ color: tokens.accent, fontFamily: font(600) }}>Verifiser med en annen enhet</Text></Pressable>
          {verification && <>
            <Text style={{ color: tokens.textSecondary }}>{verification.phase === 'done' ? 'Enheten er verifisert.' : verification.phase === 'cancelled' ? 'Verifiseringen ble avbrutt.' : `Sammenlign med enhet ${verification.device || 'på den andre klienten'}.`}</Text>
            {verification.phase === 'requested' && verification.incoming && <Pressable disabled={busy} onPress={() => verify('accept')}><Text style={{ color: tokens.accent }}>Godta forespørsel</Text></Pressable>}
            {verification.phase === 'ready' && <Pressable disabled={busy} onPress={() => verify('start')}><Text style={{ color: tokens.accent }}>Sammenlign emojier</Text></Pressable>}
            {verification.emoji.length > 0 && <>
              <Text style={{ color: tokens.textPrimary, fontSize: 24 }}>{verification.emoji.map(([emoji]) => emoji).join(' ')}</Text>
              <Pressable disabled={busy} onPress={() => verify('confirm')}><Text style={{ color: tokens.accent }}>Alle emojiene stemmer</Text></Pressable>
              <Pressable disabled={busy} onPress={() => verify('mismatch')}><Text style={{ color: tokens.error }}>De stemmer ikke</Text></Pressable>
            </>}
            {!['done', 'cancelled'].includes(verification.phase) && <Pressable disabled={busy} onPress={() => verify('cancel')}><Text style={{ color: tokens.textMuted }}>Avbryt verifisering</Text></Pressable>}
          </>}
          <TextInput value={key} onChangeText={setKey} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Gjenopprettingsnøkkel" placeholderTextColor={tokens.textMuted} style={{ color: tokens.textPrimary, borderWidth: 1, borderColor: tokens.border, borderRadius: 8, padding: 12 }} />
          <Pressable disabled={busy || !key.trim()} onPress={() => void action(async () => {
            const imported = await matrixCall<number>('recover', { key }); setKey(''); setResult(`${imported} meldingsnøkler gjenopprettet.`);
          })}><Text style={{ color: tokens.accent }}>{busy ? 'Venter …' : 'Gjenopprett kryptert historikk'}</Text></Pressable>
          {result ? <Text style={{ color: tokens.textSecondary }}>{result}</Text> : null}
          <Pressable disabled={busy} onPress={() => Alert.alert('Logge ut av Matrix?', 'Kalender og galleri beholder sin egen innlogging.', [
            { text: 'Avbryt', style: 'cancel' }, { text: 'Logg ut', style: 'destructive', onPress: () => void action(logoutMatrix) },
          ])}><Text style={{ color: tokens.error }}>Logg ut av Matrix</Text></Pressable>
        </View>}
        {notificationError && <Text style={{ color: tokens.error }}>{notificationError}</Text>}
        <Pressable style={styles.row} onPress={() => void Linking.openSettings().catch(() => Alert.alert('Kunne ikke åpne innstillinger', 'Åpne telefonens innstillinger manuelt.'))}><Text style={{ color: tokens.textPrimary }}>Varslingstillatelser på telefonen</Text></Pressable>
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
          <Pressable style={styles.row} onPress={() => void logout()} android_ripple={{ color: tokens.bgHover }}>
            <Ionicons name="log-out-outline" size={20} color={tokens.error} />
            <Text style={[styles.rowLabel, { color: tokens.error, fontFamily: font(600) }]}>Logg ut av kalender og galleri</Text>
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
