import type { ThreadKey } from '@/store/chatStore';

export type RootStackParamList = {
  Channels: undefined;
  Chat: {
    threadKey: ThreadKey;
    title: string;
    gid?: number;
    uid?: number;
  };
  Settings: undefined;
  Themes: undefined;
};

export type RootTabParamList = {
  ChatTab: undefined;
  GalleryTab: undefined;
  CalendarTab: undefined;
};

export type GalleryStackParamList = {
  Gallery: undefined;
  Album: { albumId: string; title: string };
  Settings: undefined;
  Themes: undefined;
};

export type CalendarStackParamList = {
  Calendar: undefined;
  EventDetail: { eventId: string; title: string };
  EventEditor: { eventId?: string };
  Album: { albumId: string; title: string };
  Settings: undefined;
  Themes: undefined;
};
