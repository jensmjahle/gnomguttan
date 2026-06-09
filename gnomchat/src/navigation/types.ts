import type { ThreadKey } from '@/store/chatStore';

export type RootStackParamList = {
  Channels: undefined;
  Chat: {
    threadKey: ThreadKey;
    title: string;
    gid?: number;
    uid?: number;
  };
  Themes: undefined;
};
