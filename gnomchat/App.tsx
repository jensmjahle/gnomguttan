import { useEffect } from 'react';
import { View, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  DefaultTheme,
  getFocusedRouteNameFromRoute,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

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
import { GalleryScreen } from '@/screens/GalleryScreen';
import { AlbumScreen } from '@/screens/AlbumScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import type { RootStackParamList, RootTabParamList, GalleryStackParamList } from '@/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const GalleryStackNav = createNativeStackNavigator<GalleryStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

/** Shared header style so every screen across the app has one consistent header. */
function useHeaderScreenOptions() {
  const { tokens, font } = useTheme();
  return {
    headerStyle: { backgroundColor: tokens.navbarBg },
    headerTintColor: tokens.textPrimary,
    headerTitleStyle: { fontFamily: font(700) },
    headerTitleAlign: 'left' as const,
    contentStyle: { backgroundColor: 'transparent' },
    headerShadowVisible: false,
  };
}

function HeaderSettingsButton({ onPress }: { onPress: () => void }) {
  const { tokens } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.headerIcon} accessibilityLabel="Innstillinger">
      <Ionicons name="settings-outline" size={22} color={tokens.textPrimary} />
    </Pressable>
  );
}

function ChatStack() {
  const screenOptions = useHeaderScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Channels"
        component={ChannelListScreen}
        options={({ navigation }) => ({
          title: 'GnomChat',
          headerRight: () => <HeaderSettingsButton onPress={() => navigation.navigate('Settings')} />,
        })}
      />
      <Stack.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ title: route.params.title })} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Innstillinger' }} />
      <Stack.Screen name="Themes" component={ThemeScreen} options={{ title: 'Utseende' }} />
    </Stack.Navigator>
  );
}

function GalleryStack() {
  const screenOptions = useHeaderScreenOptions();

  return (
    <GalleryStackNav.Navigator screenOptions={screenOptions}>
      <GalleryStackNav.Screen
        name="Gallery"
        component={GalleryScreen}
        options={({ navigation }) => ({
          title: 'Galleri',
          headerRight: () => <HeaderSettingsButton onPress={() => navigation.navigate('Settings')} />,
        })}
      />
      <GalleryStackNav.Screen
        name="Album"
        component={AlbumScreen}
        options={({ route }) => ({ title: route.params.title || 'Album' })}
      />
      <GalleryStackNav.Screen name="Settings" component={SettingsScreen} options={{ title: 'Innstillinger' }} />
      <GalleryStackNav.Screen name="Themes" component={ThemeScreen} options={{ title: 'Utseende' }} />
    </GalleryStackNav.Navigator>
  );
}

function AuthedApp() {
  const { tokens } = useTheme();
  useChatStream();

  useEffect(() => {
    void registerForNotifications();
  }, []);

  const baseTabBarStyle = { backgroundColor: tokens.navbarBg, borderTopColor: tokens.border };

  // Only show the tab bar on each tab's root screen — hide it once you drill into
  // a chat, an album, settings or the theme picker.
  const tabBarStyleFor = (route: Parameters<typeof getFocusedRouteNameFromRoute>[0], rootRouteName: string) => {
    const focused = getFocusedRouteNameFromRoute(route) ?? rootRouteName;
    return focused === rootRouteName ? baseTabBarStyle : { display: 'none' as const };
  };

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: tokens.accent,
        tabBarInactiveTintColor: tokens.textMuted,
      }}
    >
      <Tab.Screen
        name="ChatTab"
        component={ChatStack}
        options={({ route }) => ({
          tabBarStyle: tabBarStyleFor(route, 'Channels'),
          tabBarAccessibilityLabel: 'Chat',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={size} color={color} />
          ),
        })}
      />
      <Tab.Screen
        name="GalleryTab"
        component={GalleryStack}
        options={({ route }) => ({
          tabBarStyle: tabBarStyleFor(route, 'Gallery'),
          tabBarAccessibilityLabel: 'Galleri',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'images' : 'images-outline'} size={size} color={color} />
          ),
        })}
      />
    </Tab.Navigator>
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
  headerIcon: { paddingHorizontal: 4 },
});
