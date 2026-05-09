interface AppEnv {
  VOCECHAT_HOST?: string;
  APP_TITLE?: string;
}

declare global {
  interface Window {
    __APP_ENV__?: AppEnv;
  }
}

const defaultVocechatHost = import.meta.env.DEV ? '' : 'https://chat.gnomguttan.no';

export const config = {
  vocechatHost: resolveVocechatHost(window.__APP_ENV__?.VOCECHAT_HOST),
  appTitle: resolveRuntimeValue(window.__APP_ENV__?.APP_TITLE, 'Gnomguttan'),
} as const;

function resolveVocechatHost(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : defaultVocechatHost;
}

function resolveRuntimeValue(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}
