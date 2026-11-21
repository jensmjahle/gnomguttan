import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { login, register, resetPassword, checkInvite, checkReset, tokenFromLink } from '@/services/auth';
import { errorText } from '@/services/appApi';
import { useAuthStore } from '@/store/authStore';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { useTheme } from '@/theme/useTheme';
import { Button, Card, ErrorBox, Field, T } from '@/components/ui';
import { config } from '@/config';

const logo = require('../../assets/logo.png');

type Mode = 'login' | 'invite' | 'reset';

/** Sign in with the Gnomguttan account (the same as on gnomguttan.no), or use an invite / reset link. */
export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const signedOutReason = useAuthStore((s) => s.signedOutReason);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [linkInfo, setLinkInfo] = useState('');
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError(''); setBusy(true);
    try { await fn(); } catch (reason) { setError(errorText(reason, 'Innloggingen feilet.')); } finally { setBusy(false); }
  };

  const checkLink = () => run(async () => {
    const token = tokenFromLink(link);
    if (!token) throw new Error('Lim inn lenken du fikk.');
    if (mode === 'invite') {
      const info = await checkInvite(token);
      setLinkInfo(`Invitert av ${info.invitedBy}.`);
    } else {
      const info = await checkReset(token);
      setLinkInfo(`Nytt passord for ${info.name}.`);
    }
    setChecked(true);
  });

  const switchMode = (next: Mode) => { setMode(next); setError(''); setChecked(false); setLinkInfo(''); setLink(''); setPassword(''); };

  return (
    <ThemedBackground>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <View style={styles.header}>
              <Image source={logo} style={styles.logo} contentFit="contain" />
              <T weight={800} size={26}>Gnomguttan</T>
              <T muted style={{ textAlign: 'center' }}>
                {mode === 'login' ? 'Logg inn med samme konto som på gnomguttan.no.' : mode === 'invite' ? 'Lag konto med invitasjonslenken du har fått.' : 'Velg nytt passord med lenken du har fått.'}
              </T>
            </View>

            {signedOutReason && mode === 'login' ? <ErrorBox message={signedOutReason} /> : null}

            {mode === 'login' ? (
              <>
                <Field label="E-post" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" editable={!busy} />
                <Field label="Passord" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoComplete="password" editable={!busy} onSubmitEditing={() => run(() => login(email, password))} returnKeyType="go" />
                <ErrorBox message={error} />
                <Button title="Logg inn" busy={busy} disabled={!email.trim() || !password} onPress={() => run(() => login(email, password))} />
                <View style={styles.links}>
                  <Button variant="ghost" small title="Har du en invitasjon?" onPress={() => switchMode('invite')} />
                  <Button variant="ghost" small title="Glemt passord?" onPress={() => switchMode('reset')} />
                </View>
              </>
            ) : (
              <>
                {!checked ? (
                  <>
                    <Field label={mode === 'invite' ? 'Invitasjonslenke' : 'Lenke for nytt passord'} value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} placeholder={`${config.appApiHost}/${mode === 'invite' ? 'registrer' : 'tilbakestill'}#…`} editable={!busy} />
                    {mode === 'reset' ? <T size={13} muted>Har du glemt passordet, ber du en administrator i gjengen om en lenke for nytt passord.</T> : null}
                    <ErrorBox message={error} />
                    <Button title="Fortsett" busy={busy} disabled={!link.trim()} onPress={checkLink} />
                  </>
                ) : (
                  <>
                    <T weight={600} color={tokens.success}>{linkInfo}</T>
                    {mode === 'invite' ? (
                      <>
                        <Field label="Navn" value={name} onChangeText={setName} autoCapitalize="words" editable={!busy} />
                        <Field label="E-post" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" editable={!busy} />
                      </>
                    ) : null}
                    <Field label="Nytt passord" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" hint="Minst 8 tegn." editable={!busy} />
                    <ErrorBox message={error} />
                    <Button
                      title={mode === 'invite' ? 'Lag konto' : 'Lagre passord og logg inn'}
                      busy={busy}
                      disabled={password.length < 8 || (mode === 'invite' && (!name.trim() || !email.trim()))}
                      onPress={() => run(() => (mode === 'invite'
                        ? register({ token: tokenFromLink(link), name: name.trim(), email: email.trim(), password })
                        : resetPassword({ token: tokenFromLink(link), password })))}
                    />
                  </>
                )}
                <Button variant="ghost" small title="Tilbake til innlogging" onPress={() => switchMode('login')} />
              </>
            )}
          </Card>
          <Button variant="ghost" small title="Åpne gnomguttan.no" onPress={() => void WebBrowser.openBrowserAsync(config.appApiHost)} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 12 },
  card: { padding: 22, gap: 14 },
  header: { alignItems: 'center', gap: 8, marginBottom: 6 },
  logo: { width: 84, height: 84 },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
});
