import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/services/api';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { config } from '@/config';

const logo = require('../../assets/logo.png');

export function LoginScreen() {
  const { login } = useAuth();
  const { tokens, font, radius } = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      await login({ email: email.trim(), password });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403 || err.status === 404) {
          setError('Invalid email or password. Please try again.');
        } else if (err.status === 423) {
          setError('This account is frozen.');
        } else {
          setError(`Login failed (${err.status}). Check the server and try again.`);
        }
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.border, borderRadius: radius.lg }]}>
          <Image source={logo} style={styles.logo} contentFit="contain" />
          <Text style={[styles.title, { color: tokens.textPrimary, fontFamily: font(700) }]}>GnomChat</Text>
          <Text style={[styles.subtitle, { color: tokens.textSecondary, fontFamily: font(400) }]}>
            Sign in with your VoceChat account
          </Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={tokens.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            style={[styles.input, { color: tokens.textPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={tokens.textMuted}
            secureTextEntry
            autoComplete="current-password"
            onSubmitEditing={onSubmit}
            style={[styles.input, { color: tokens.textPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]}
          />

          {!!error && <Text style={[styles.error, { color: tokens.error, fontFamily: font(500) }]}>{error}</Text>}

          <Pressable
            onPress={onSubmit}
            disabled={loading || !email || !password}
            style={[
              styles.button,
              { backgroundColor: tokens.accent, borderRadius: radius.md, opacity: loading || !email || !password ? 0.6 : 1 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={tokens.accentFg} />
            ) : (
              <Text style={[styles.buttonText, { color: tokens.accentFg, fontFamily: font(600) }]}>Sign in</Text>
            )}
          </Pressable>

          <Text style={[styles.hint, { color: tokens.textMuted, fontFamily: font(400) }]}>
            Connects to {config.vocechatHost}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { padding: 24, borderWidth: StyleSheet.hairlineWidth, gap: 12, alignItems: 'stretch' },
  logo: { width: 72, height: 72, alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 26, textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 8 },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  button: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonText: { fontSize: 16 },
  error: { fontSize: 13, textAlign: 'center' },
  hint: { fontSize: 11, textAlign: 'center', marginTop: 8 },
});
