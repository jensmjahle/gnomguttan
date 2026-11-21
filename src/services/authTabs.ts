import { useAuthStore, type AppSession, type VoceChatSession } from '@/store/authStore';

// A login without "Husk meg" lives in sessionStorage, which each tab has its own copy of.
// New tabs ask the open ones for it, so the login lasts for the browser session the way a
// session cookie would. Logging out in one tab logs out the others too.

type Message =
  | { type: 'ask' }
  | { type: 'share'; session: AppSession; vocechat: VoceChatSession | null }
  | { type: 'logout' };

const ASK_TIMEOUT_MS = 200;
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('gnomguttan-auth');

/** Call once before rendering. Resolves when this tab has a login, or nobody had one to share. */
export function startAuthTabSync(): Promise<void> {
  if (!channel) return Promise.resolve();

  channel.addEventListener('message', (event: MessageEvent<Message>) => {
    const state = useAuthStore.getState();
    if (event.data.type === 'ask' && state.token && state.user && state.expiresAt && !state.remember) {
      channel.postMessage({
        type: 'share',
        session: { user: state.user, token: state.token, expiresAt: state.expiresAt, remember: false },
        vocechat: state.vocechat,
      } satisfies Message);
    } else if (event.data.type === 'logout' && state.token) {
      state.clearAuth();
    }
  });

  if (useAuthStore.getState().token) return Promise.resolve();

  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      channel.removeEventListener('message', onShare);
      resolve();
    };
    const onShare = (event: MessageEvent<Message>) => {
      if (event.data.type !== 'share' || useAuthStore.getState().token) return;
      useAuthStore.getState().setAuth(event.data.session);
      useAuthStore.getState().setVoceChat(event.data.vocechat);
      done();
    };
    const timer = setTimeout(done, ASK_TIMEOUT_MS);
    channel.addEventListener('message', onShare);
    channel.postMessage({ type: 'ask' } satisfies Message);
  });
}

export function broadcastLogout() {
  channel?.postMessage({ type: 'logout' } satisfies Message);
}
