import { useEffect } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { NavigationContainer, DefaultTheme, type Theme as NavTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useQuery } from '@tanstack/react-query';

import { ThemeProvider, useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { useAppFonts } from '@/theme/fonts';
import { useAuth } from '@/hooks/useAuth';
import { CACHE_BUSTER, queryClient, queryPersister, qk } from '@/data/queryClient';
import { useLiveUpdates } from '@/data/liveUpdates';
import { refreshMe } from '@/services/auth';
import { clearDelivered, listenForPushTaps, loadNotifications, registerForPush } from '@/services/notifications';
import { flushPendingNavigation, navigationRef } from '@/navigation/navigationRef';
import type { RootStackParamList, TabParamList } from '@/navigation/types';
import { EngineHost } from '@/matrix/EngineHost';
import { startMatrixPush } from '@/matrix/push';
import { totalUnread, useMatrixStore } from '@/matrix/store';
import { HeaderActions } from '@/components/HeaderActions';
import { MeowCat } from '@/components/MeowCat';

import { LoginScreen } from '@/screens/LoginScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { FeedPostScreen } from '@/screens/FeedPostScreen';
import { StatusrapportScreen } from '@/screens/StatusrapportScreen';
import { NotificationsScreen } from '@/screens/NotificationsScreen';
import { NotificationSettingsScreen } from '@/screens/NotificationSettingsScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { ProfileEditScreen } from '@/screens/ProfileEditScreen';
import { QuotesScreen } from '@/screens/QuotesScreen';
import { ChatListScreen } from '@/screens/chat/ChatListScreen';
import { ChatRoomScreen } from '@/screens/chat/ChatRoomScreen';
import { ChatRoomSettingsScreen } from '@/screens/chat/ChatRoomSettingsScreen';
import { ChatSpaceScreen } from '@/screens/chat/ChatSpaceScreen';
import { ChatNewScreen } from '@/screens/chat/ChatNewScreen';
import { ChatSettingsScreen } from '@/screens/chat/ChatSettingsScreen';
import { CalendarScreen } from '@/screens/CalendarScreen';
import { EventDetailScreen } from '@/screens/EventDetailScreen';
import { EventEditorScreen } from '@/screens/EventEditorScreen';
import { GalleryScreen } from '@/screens/GalleryScreen';
import { AlbumScreen } from '@/screens/AlbumScreen';
import { AlbumEditorScreen } from '@/screens/AlbumEditorScreen';
import { ArchiveScreen } from '@/screens/ArchiveScreen';
import { MoreScreen } from '@/screens/MoreScreen';
import { KinoScreen } from '@/screens/KinoScreen';
import { ValheimScreen } from '@/screens/ValheimScreen';
import { OlborsScreen } from '@/screens/OlborsScreen';
import { SpinScreen } from '@/screens/SpinScreen';
import { LampaScreen } from '@/screens/LampaScreen';
import { TournamentScreen } from '@/screens/TournamentScreen';
import { PigsScreen } from '@/screens/PigsScreen';
import { KrokodilScreen } from '@/screens/KrokodilScreen';
import { DevScreen } from '@/screens/DevScreen';
import { DevIssueScreen } from '@/screens/DevIssueScreen';
import { BussScreen } from '@/screens/BussScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { ThemeScreen } from '@/screens/ThemeScreen';
import { AccountScreen } from '@/screens/AccountScreen';
import { AdminScreen } from '@/screens/AdminScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function useHeaderOptions() {
  const { tokens, font } = useTheme();
  return {
    headerStyle: { backgroundColor: tokens.navbarBg },
    headerTintColor: tokens.textPrimary,
    headerTitleStyle: { fontFamily: font(700) },
    headerTitleAlign: 'left' as const,
    headerShadowVisible: false,
    contentStyle: { backgroundColor: 'transparent' },
  };
}

function Tabs() {
  const { tokens } = useTheme();
  const header = useHeaderOptions();
  const chatUnread = useMatrixStore((state) => totalUnread(state.rooms));
  const insets = useSafeAreaInsets();
  const tabIcon = (name: keyof typeof Ionicons.glyphMap, outline: keyof typeof Ionicons.glyphMap) =>
    ({ color, size, focused }: { color: string; size: number; focused: boolean }) => <Ionicons name={focused ? name : outline} size={size} color={color} />;

  return (
    <Tab.Navigator
      screenOptions={{
        ...header,
        sceneStyle: { backgroundColor: 'transparent' },
        headerRight: () => <HeaderActions />,
        tabBarStyle: { backgroundColor: tokens.navbarBg, borderTopColor: tokens.border, height: 62 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 6 },
        tabBarActiveTintColor: tokens.accent,
        tabBarInactiveTintColor: tokens.textMuted,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: 'Gnomguttan', tabBarLabel: 'Hjem', headerLeft: () => <MeowCat />, tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tab.Screen name="ChatTab" component={ChatListScreen} options={{ title: 'Chat', tabBarIcon: tabIcon('chatbubbles', 'chatbubbles-outline'), tabBarBadge: chatUnread > 0 ? (chatUnread > 99 ? '99+' : chatUnread) : undefined }} />
      <Tab.Screen name="CalendarTab" component={CalendarScreen} options={{ title: 'Kalender', tabBarIcon: tabIcon('calendar', 'calendar-outline') }} />
      <Tab.Screen name="GalleryTab" component={GalleryScreen} options={{ title: 'Galleri', tabBarIcon: tabIcon('images', 'images-outline') }} />
      <Tab.Screen name="MoreTab" component={MoreScreen} options={{ title: 'Mer', tabBarIcon: tabIcon('grid', 'grid-outline') }} />
    </Tab.Navigator>
  );
}

function AuthedApp() {
  const header = useHeaderOptions();
  useLiveUpdates();
  // Keeps the unread badge for the bell warm (and cached for offline).
  useQuery({ queryKey: qk.notifications, queryFn: () => loadNotifications(), refetchInterval: 5 * 60_000 });

  useEffect(() => {
    void refreshMe().catch(() => {});
    void registerForPush();
    void clearDelivered();
    const stopPush = startMatrixPush();
    const stopTaps = listenForPushTaps();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void clearDelivered(); });
    return () => { stopPush(); stopTaps(); subscription.remove(); };
  }, []);

  return (
    <>
      <EngineHost />
      <Stack.Navigator screenOptions={header}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="FeedPost" component={FeedPostScreen} options={{ title: 'Innlegg' }} />
        <Stack.Screen name="Statusrapport" component={StatusrapportScreen} options={{ title: 'Ny statusrapport', presentation: 'modal' }} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Varsler' }} />
        <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ title: 'Varslingsinnstillinger' }} />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
        <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} options={{ title: 'Rediger profil' }} />
        <Stack.Screen name="Quotes" component={QuotesScreen} options={{ title: 'Overhørt' }} />
        <Stack.Screen name="EventDetail" component={EventDetailScreen} options={({ route }) => ({ title: route.params.title || 'Arrangement' })} />
        <Stack.Screen name="EventEditor" component={EventEditorScreen} options={({ route }) => ({ title: route.params?.eventId ? 'Rediger arrangement' : 'Nytt arrangement' })} />
        <Stack.Screen name="Album" component={AlbumScreen} options={({ route }) => ({ title: route.params.title || 'Album' })} />
        <Stack.Screen name="AlbumEditor" component={AlbumEditorScreen} options={({ route }) => ({ title: route.params?.albumId ? 'Rediger album' : 'Nytt album', presentation: 'modal' })} />
        <Stack.Screen name="Archive" component={ArchiveScreen} options={{ title: 'Arkiv' }} />
        <Stack.Screen name="ChatRoom" component={ChatRoomScreen} options={({ route }) => ({ title: route.params.title || 'Chat' })} />
        <Stack.Screen name="ChatRoomSettings" component={ChatRoomSettingsScreen} options={{ title: 'Rominnstillinger' }} />
        <Stack.Screen name="ChatSpace" component={ChatSpaceScreen} options={({ route }) => ({ title: route.params.title || 'Space' })} />
        <Stack.Screen name="ChatNew" component={ChatNewScreen} options={{ title: 'Ny samtale', presentation: 'modal' }} />
        <Stack.Screen name="ChatSettings" component={ChatSettingsScreen} options={{ title: 'Chatinnstillinger' }} />
        <Stack.Screen name="Kino" component={KinoScreen} options={{ title: 'Kino' }} />
        <Stack.Screen name="Valheim" component={ValheimScreen} options={{ title: 'Valheim' }} />
        <Stack.Screen name="Olbors" component={OlborsScreen} options={{ title: 'Ølbørs' }} />
        <Stack.Screen name="Spin" component={SpinScreen} options={{ title: 'Lykkehjulet' }} />
        <Stack.Screen name="Lampa" component={LampaScreen} options={{ title: 'Lampa til Jens' }} />
        <Stack.Screen name="Tournament" component={TournamentScreen} options={{ title: 'Turnering' }} />
        <Stack.Screen name="Pigs" component={PigsScreen} options={{ title: 'Kast grisene' }} />
        <Stack.Screen name="Krokodil" component={KrokodilScreen} options={{ title: 'Krokodil' }} />
        <Stack.Screen name="Dev" component={DevScreen} options={{ title: 'Dev' }} />
        <Stack.Screen name="DevIssue" component={DevIssueScreen} options={({ route }) => ({ title: `#${route.params.number}` })} />
        <Stack.Screen name="Buss" component={BussScreen} options={{ title: 'Buss' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Innstillinger' }} />
        <Stack.Screen name="Themes" component={ThemeScreen} options={{ title: 'Utseende' }} />
        <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'Konto og sikkerhet' }} />
        <Stack.Screen name="Admin" component={AdminScreen} options={{ title: 'Administrasjon' }} />
      </Stack.Navigator>
    </>
  );
}

function Root() {
  const { tokens, themeId } = useTheme();
  const { isAuthenticated, hydrated } = useAuth();
  const [fontsLoaded] = useAppFonts();

  if (!hydrated || !fontsLoaded) {
    return (
      <ThemedBackground>
        <View style={styles.center}><ActivityIndicator color={tokens.accent} /></View>
      </ThemedBackground>
    );
  }

  const navTheme: NavTheme = {
    ...DefaultTheme,
    dark: false,
    colors: { ...DefaultTheme.colors, primary: tokens.accent, background: tokens.bgPrimary, card: tokens.navbarBg, text: tokens.textPrimary, border: tokens.border, notification: tokens.error },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={flushPendingNavigation}>
      <StatusBar style="auto" />
      {isAuthenticated ? <AuthedApp /> : <LoginScreen key={themeId} />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, buster: CACHE_BUSTER, maxAge: 7 * 24 * 60 * 60 * 1000 }}>
        <ThemeProvider>
          <Root />
        </ThemeProvider>
      </PersistQueryClientProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
