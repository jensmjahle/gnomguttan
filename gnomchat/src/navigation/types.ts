import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  HomeTab: undefined;
  ChatTab: undefined;
  CalendarTab: undefined;
  GalleryTab: undefined;
  MoreTab: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  // Feed, notifications, profiles
  FeedPost: { feedItemId: string; commentId?: string };
  Statusrapport: undefined;
  Notifications: undefined;
  NotificationSettings: undefined;
  Profile: { uid?: number };
  ProfileEdit: undefined;
  Quotes: undefined;
  // Events and gallery
  EventDetail: { eventId: string; title?: string; commentId?: string };
  EventEditor: { eventId?: string } | undefined;
  Album: { albumId: string; title?: string };
  AlbumEditor: { albumId?: string } | undefined;
  Archive: undefined;
  // Chat (Matrix)
  ChatRoom: { roomId: string; title?: string };
  ChatRoomSettings: { roomId: string };
  ChatSpace: { roomId: string; title?: string };
  ChatNew: undefined;
  ChatSettings: undefined;
  // Everything else on the website
  Kino: undefined;
  Valheim: undefined;
  Olbors: { eventId?: string } | undefined;
  Spin: undefined;
  Lampa: undefined;
  Tournament: undefined;
  Pigs: undefined;
  Krokodil: undefined;
  Dev: undefined;
  DevIssue: { number: number; title?: string };
  Buss: undefined;
  // Settings
  Settings: undefined;
  Themes: undefined;
  Account: undefined;
  Admin: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
