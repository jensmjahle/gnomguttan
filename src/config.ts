interface AppEnv {
  VOCECHAT_HOST?: string;
  APP_TITLE?: string;
}

declare global {
  interface Window {
    __APP_ENV__?: AppEnv;
  }
}

export const config = {
  vocechatHost: window.__APP_ENV__?.VOCECHAT_HOST ?? 'https://chat.gnomguttan.no',
  appTitle: window.__APP_ENV__?.APP_TITLE ?? 'Gnomguttan',
} as const;
