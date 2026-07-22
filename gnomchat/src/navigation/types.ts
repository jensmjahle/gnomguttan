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
};

export type GalleryStackParamList = {
  Gallery: undefined;
  Album: { albumId: string; title: string };
  Settings: undefined;
  Themes: undefined;
};
