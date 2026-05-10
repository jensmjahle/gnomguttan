function toBoolean(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(trimmed);
}

export function getRuntimeEnv() {
  const botTargetGroupId = process.env.VOCECHAT_BOT_TARGET_GROUP_ID ?? '';
  const botApiKey = process.env.VOCECHAT_BOT_API_KEY ?? '';

  return {
    VOCECHAT_HOST: process.env.VOCECHAT_HOST ?? 'https://chat.gnomguttan.no',
    APP_TITLE: process.env.APP_TITLE ?? 'Gnomguttan',
    JELLYFIN_CLIENT_URL: process.env.JELLYFIN_CLIENT_URL ?? 'https://kino.gnomguttan.no',
    ENTUR_BUS_URL: process.env.ENTUR_BUS_URL ?? 'https://vis-tavla.entur.no/mtrSJAbxWoDvk9EOMG7I',
    VOCECHAT_BOT_TARGET_GROUP_ID: botTargetGroupId,
    VOCECHAT_BOT_INFO_ENABLED: toBoolean(process.env.VOCECHAT_BOT_INFO_ENABLED) || Boolean(botApiKey && botTargetGroupId),
  };
}

export function buildRuntimeEnvJs() {
  const runtimeEnv = getRuntimeEnv();
  return `window.__APP_ENV__ = ${JSON.stringify({
    ...runtimeEnv,
    VOCECHAT_BOT_INFO_ENABLED: runtimeEnv.VOCECHAT_BOT_INFO_ENABLED ? 'true' : 'false',
  })};\n`;
}
