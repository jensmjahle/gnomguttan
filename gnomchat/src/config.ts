import Constants from 'expo-constants';

const DEFAULT_HOST = 'https://chat.gnomguttan.no';
const DEFAULT_APP_API_HOST = 'https://gnomguttan.no';

type ExtraConfig = { vocechatHost?: string; appApiHost?: string } | undefined;

function resolveHost(): string {
  // Priority: EXPO_PUBLIC_ env (inlined at build) → app.config extra → default.
  const fromEnv = process.env.EXPO_PUBLIC_VOCECHAT_HOST?.trim();
  const fromExtra = (Constants.expoConfig?.extra as ExtraConfig)?.vocechatHost?.trim();
  return fromEnv || fromExtra || DEFAULT_HOST;
}

function resolveAppApiHost(): string {
  const fromEnv = process.env.EXPO_PUBLIC_APP_API_HOST?.trim();
  const fromExtra = (Constants.expoConfig?.extra as ExtraConfig)?.appApiHost?.trim();
  return fromEnv || fromExtra || DEFAULT_APP_API_HOST;
}

export const config = {
  /** Base URL of the VoceChat server (same server the website uses). */
  vocechatHost: resolveHost().replace(/\/+$/, ''),
  /** Base URL of the Gnomguttan website backend that serves /app-api (albums etc.). */
  appApiHost: resolveAppApiHost().replace(/\/+$/, ''),
} as const;
