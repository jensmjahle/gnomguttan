interface AppEnv {
  VOCECHAT_HOST?: string;
  APP_TITLE?: string;
  JELLYFIN_CLIENT_URL?: string;
  VOCECHAT_BOT_TARGET_GROUP_ID?: string;
  VOCECHAT_BOT_INFO_ENABLED?: string;
}

declare global {
  interface Window {
    __APP_ENV__?: AppEnv;
  }
}

const defaultVocechatHost = import.meta.env.DEV ? '' : 'https://chat.gnomguttan.no';
const defaultJellyfinClientUrl = 'https://kino.gnomguttan.no';

export const config = {
  vocechatHost: resolveVocechatHost(window.__APP_ENV__?.VOCECHAT_HOST),
  appTitle: resolveRuntimeValue(window.__APP_ENV__?.APP_TITLE, 'Gnomguttan'),
  jellyfinClientUrl: resolveJellyfinClientUrl(window.__APP_ENV__?.JELLYFIN_CLIENT_URL),
  vocechatBotTargetGroupId: resolveOptionalNumber(window.__APP_ENV__?.VOCECHAT_BOT_TARGET_GROUP_ID),
  vocechatBotInfoEnabled: resolveBoolean(window.__APP_ENV__?.VOCECHAT_BOT_INFO_ENABLED),
} as const;

function resolveVocechatHost(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : defaultVocechatHost;
}

function resolveRuntimeValue(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function resolveJellyfinClientUrl(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : defaultJellyfinClientUrl;
}

function resolveOptionalNumber(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveBoolean(value: string | undefined, fallback = false) {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(trimmed);
}
