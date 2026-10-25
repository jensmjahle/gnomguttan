import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { useMatrixMobileStore } from '@/store/matrixMobileStore';
import { loginMatrix } from '@/services/matrix';

export function MatrixLoginScreen() {
  const { tokens, font, radius } = useTheme();
  const ready = useMatrixMobileStore(s => s.engineReady);
  const runtimeError = useMatrixMobileStore(s => s.error);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('https://gnomchat.gnomguttan.no');
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function login() {
    if (busy || !ready || !username.trim() || !password) return;
    setBusy(true); setError('');
    try { await loginMatrix(username, password, server); setPassword(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke logge inn.'); }
    finally { setBusy(false); }
  }
  const input = { color: tokens.textPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) };
  return <ThemedBackground><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.border, borderRadius: radius.lg }]}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} contentFit="contain" />
        <Text style={[styles.title, { color: tokens.textPrimary, fontFamily: font(700) }]}>GnomChat</Text>
        <Text style={[styles.subtitle, { color: tokens.textSecondary, fontFamily: font(400) }]}>Logg inn med Matrix-kontoen din</Text>
        <TextInput value={username} onChangeText={setUsername} placeholder="Brukernavn" placeholderTextColor={tokens.textMuted} autoCapitalize="none" autoCorrect={false} autoComplete="username" style={[styles.input, input]} />
        <TextInput value={password} onChangeText={setPassword} placeholder="Passord" placeholderTextColor={tokens.textMuted} secureTextEntry autoComplete="current-password" onSubmitEditing={() => void login()} style={[styles.input, input]} />
        {showServer && <TextInput value={server} onChangeText={setServer} placeholder="Matrix-server" placeholderTextColor={tokens.textMuted} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={[styles.input, input]} />}
        {(error || runtimeError) && <Text style={{ color: tokens.error }}>{error || runtimeError}</Text>}
        <Pressable onPress={() => void login()} disabled={busy || !ready || !username.trim() || !password} style={[styles.button, { backgroundColor: tokens.accent, borderRadius: radius.md, opacity: busy || !ready ? 0.6 : 1 }]}>
          {busy || !ready ? <ActivityIndicator color={tokens.accentFg} /> : <Text style={{ color: tokens.accentFg, fontFamily: font(600) }}>Logg inn</Text>}
        </Pressable>
        <Pressable onPress={() => setShowServer(value => !value)}><Text style={{ color: tokens.textMuted, textAlign: 'center', fontSize: 12 }}>Endre Matrix-server</Text></Pressable>
      </View>
    </ScrollView>
  </KeyboardAvoidingView></ThemedBackground>;
}
const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: { padding: 24, borderWidth: 1, gap: 14 }, logo: { width: 90, height: 90, alignSelf: 'center' },
  title: { fontSize: 28, textAlign: 'center' }, subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 8 },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }, button: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
});
