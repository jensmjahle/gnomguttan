import Constants from 'expo-constants';

const DEFAULT_HOST = 'https://chat.gnomguttan.no';

function resolveHost(): string {
  // Priority: EXPO_PUBLIC_ env (inlined at build) → app.config extra → default.
  const fromEnv = process.env.EXPO_PUBLIC_VOCECHAT_HOST?.trim();
  const fromExtra = (Constants.expoConfig?.extra as { vocechatHost?: string } | undefined)?.vocechatHost?.trim();
  return fromEnv || fromExtra || DEFAULT_HOST;
}

export const config = {
  /** Base URL of the VoceChat server (same server the website uses). */
  vocechatHost: resolveHost().replace(/\/+$/, ''),
} as const;
