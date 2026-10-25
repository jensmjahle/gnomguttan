import { useEffect } from 'react';
import { AppState, View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import type { NotificationResponse } from 'expo-notifications';
import { getNotifications } from '@/services/notifications';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  DefaultTheme,
  getFocusedRouteNameFromRoute,
  createNavigationContainerRef,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { ThemeProvider, useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { useAppFonts } from '@/theme/fonts';
import { useAuth } from '@/hooks/useAuth';
import { ChannelListScreen } from '@/screens/ChannelListScreen';
import { ChatScreen } from '@/screens/ChatScreen';
import { RoomSettingsScreen } from '@/screens/RoomSettingsScreen';
import { SpaceScreen } from '@/screens/SpaceScreen';
import { MatrixRuntime } from '@/components/MatrixRuntime';
import { useMatrixMobileStore } from '@/store/matrixMobileStore';
import { shouldPresentMessage } from '@/utils/mobileChat';

import { LoginScreen } from '@/screens/LoginScreen';
import { ThemeScreen } from '@/screens/ThemeScreen';
import { GalleryScreen } from '@/screens/GalleryScreen';
import { AlbumScreen } from '@/screens/AlbumScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { CalendarScreen } from '@/screens/CalendarScreen';
import { EventDetailScreen } from '@/screens/EventDetailScreen';
import { EventEditorScreen } from '@/screens/EventEditorScreen';
import type {
  RootStackParamList,
  RootTabParamList,
  GalleryStackParamList,
  CalendarStackParamList,
} from '@/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const GalleryStackNav = createNativeStackNavigator<GalleryStackParamList>();
const CalendarStackNav = createNativeStackNavigator<CalendarStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();
const navigationRef = createNavigationContainerRef<RootTabParamList>();
const Notifications = getNotifications();
Notifications?.setNotificationHandler({ handleNotification: async notification => {
  const show = shouldPresentMessage(notification.request.content.data, useMatrixMobileStore.getState(), AppState.currentState === 'active');
  return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: true };
} });

function LegacyGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated } = useAuth();
  if (!hydrated) return <ActivityIndicator />;
  return isAuthenticated ? <>{children}</> : <LoginScreen />;
}

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
      <Stack.Screen name="Chat" component={ChatScreen} getId={({ params }) => params.roomId} options={({ route }) => ({ title: route.params.title })} />
      <Stack.Screen name="Space" component={SpaceScreen} getId={({ params }) => params.roomId} options={({ route }) => ({ title: route.params.title })} />
      <Stack.Screen name="RoomSettings" component={RoomSettingsScreen} getId={({ params }) => params.roomId} options={{ title: 'Rom og medlemmer' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Innstillinger' }} />
      <Stack.Screen name="Themes" component={ThemeScreen} options={{ title: 'Utseende' }} />
    </Stack.Navigator>
  );
}

function GalleryStackContent() {
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

function CalendarStackContent() {
  const screenOptions = useHeaderScreenOptions();

  return (
    <CalendarStackNav.Navigator screenOptions={screenOptions}>
      <CalendarStackNav.Screen
        name="Calendar"
        component={CalendarScreen}
        options={({ navigation }) => ({
          title: 'Kalender',
          headerRight: () => <HeaderSettingsButton onPress={() => navigation.navigate('Settings')} />,
        })}
      />
      <CalendarStackNav.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={({ route }) => ({ title: route.params.title || 'Arrangement' })}
      />
      <CalendarStackNav.Screen
        name="EventEditor"
        component={EventEditorScreen}
        options={({ route }) => ({ title: route.params?.eventId ? 'Rediger arrangement' : 'Nytt arrangement' })}
      />
      <CalendarStackNav.Screen
        name="Album"
        component={AlbumScreen}
        options={({ route }) => ({ title: route.params.title || 'Album' })}
      />
      <CalendarStackNav.Screen name="Settings" component={SettingsScreen} options={{ title: 'Innstillinger' }} />
      <CalendarStackNav.Screen name="Themes" component={ThemeScreen} options={{ title: 'Utseende' }} />
    </CalendarStackNav.Navigator>
  );
}

function GalleryStack() { return <LegacyGate><GalleryStackContent /></LegacyGate>; }
function CalendarStack() { return <LegacyGate><CalendarStackContent /></LegacyGate>; }

function AuthedApp() {
  const { tokens } = useTheme();
  const matrixAuthenticated = useMatrixMobileStore(s => s.authenticated);
  const unreadCount = useMatrixMobileStore(s => s.unreadCount);
  useEffect(() => {
    if (!matrixAuthenticated && navigationRef.isReady()) navigationRef.navigate('ChatTab');
  }, [matrixAuthenticated]);

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
          tabBarBadge: matrixAuthenticated && unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
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
      <Tab.Screen
        name="CalendarTab"
        component={CalendarStack}
        options={({ route }) => ({
          tabBarStyle: tabBarStyleFor(route, 'Calendar'),
          tabBarAccessibilityLabel: 'Kalender',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />
          ),
        })}
      />
    </Tab.Navigator>
  );
}

function Root() {
  const { tokens } = useTheme();
  const { hydrated } = useAuth();
  const [fontsLoaded, fontError] = useAppFonts();
  useEffect(() => {
    if (fontError) console.warn('Kunne ikke laste skrifttypene. Bruker systemskrift.', fontError);
  }, [fontError]);
  useEffect(() => {
    if (!Notifications) return;
    let active = true;
    let responseReceived = false;
    const open = (response: NotificationResponse | null) => {
      if (!active) return;
      const roomId = response?.notification.request.content.data?.roomId;
      if (typeof roomId !== 'string' || !roomId) return;
      useMatrixMobileStore.setState({ pendingRoom: roomId });
      if (navigationRef.isReady()) navigationRef.navigate('ChatTab');
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };
    const listener = Notifications.addNotificationResponseReceivedListener(response => {
      responseReceived = true;
      open(response);
    });
    void Notifications.getLastNotificationResponseAsync().then(response => {
      if (!responseReceived) open(response);
    }).catch(error => console.warn('Kunne ikke lese siste varsel.', error));
    return () => { active = false; listener.remove(); };
  }, []);

  if (!hydrated || (!fontsLoaded && !fontError)) {
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
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <StatusBar style="auto" />
      <AuthedApp />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <MatrixRuntime />
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { paddingHorizontal: 4 },
});
