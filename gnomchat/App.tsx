import { useEffect } from 'react';
import { View, ActivityIndicator, Pressable, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, type Theme as NavTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ThemeProvider, useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { useAppFonts } from '@/theme/fonts';
import { useAuth } from '@/hooks/useAuth';
import { useChatStream } from '@/hooks/useChatStream';
import { registerForNotifications } from '@/services/notifications';

import { LoginScreen } from '@/screens/LoginScreen';
import { ChannelListScreen } from '@/screens/ChannelListScreen';
import { ChatScreen } from '@/screens/ChatScreen';
import { ThemeScreen } from '@/screens/ThemeScreen';
import type { RootStackParamList } from '@/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function HeaderButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { tokens, font } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={{ color: tokens.accent, fontFamily: font(600), fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

function AuthedApp() {
  const { tokens, font } = useTheme();
  const { logout } = useAuth();
  useChatStream();

  useEffect(() => {
    void registerForNotifications();
  }, []);

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: tokens.navbarBg },
        headerTintColor: tokens.textPrimary,
        headerTitleStyle: { fontFamily: font(700) },
        contentStyle: { backgroundColor: 'transparent' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="Channels"
        component={ChannelListScreen}
        options={({ navigation }) => ({
          title: 'GnomChat',
          headerRight: () => (
            <View style={styles.headerRight}>
              <HeaderButton label="Theme" onPress={() => navigation.navigate('Themes')} />
              <HeaderButton label="Sign out" onPress={logout} />
            </View>
          ),
        })}
      />
      <Stack.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ title: route.params.title })} />
      <Stack.Screen name="Themes" component={ThemeScreen} options={{ title: 'Appearance' }} />
    </Stack.Navigator>
  );
}

function Root() {
  const { tokens, themeId } = useTheme();
  const { isAuthenticated, hydrated } = useAuth();
  const [fontsLoaded] = useAppFonts();

  if (!hydrated || !fontsLoaded) {
    return (
      <ThemedBackground>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.accent} />
        </View>
      </ThemedBackground>
    );
  }

  const navTheme: NavTheme = {
    ...DefaultTheme,
    dark: false,
    colors: {
      ...DefaultTheme.colors,
      primary: tokens.accent,
      background: 'transparent',
      card: tokens.navbarBg,
      text: tokens.textPrimary,
      border: tokens.border,
      notification: tokens.accent,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="auto" />
      {isAuthenticated ? <AuthedApp /> : <LoginScreen key={themeId} />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRight: { flexDirection: 'row', gap: 16, alignItems: 'center' },
});
