#!/bin/sh
set -e

# Inject runtime environment into env.js so the SPA reads it at startup.
# Set these in your docker-compose.yml environment section.
bot_info_enabled="false"
if [ -n "${VOCECHAT_BOT_API_KEY:-}" ] && [ -n "${VOCECHAT_BOT_TARGET_GROUP_ID:-}" ]; then
  bot_info_enabled="true"
fi

cat > /usr/share/nginx/html/env.js << EOF
window.__APP_ENV__ = {
  VOCECHAT_HOST: "${VOCECHAT_HOST:-https://chat.gnomguttan.no}",
  APP_TITLE: "${APP_TITLE:-Gnomguttan}",
  JELLYFIN_CLIENT_URL: "${JELLYFIN_CLIENT_URL:-https://kino.gnomguttan.no}",
  VOCECHAT_BOT_TARGET_GROUP_ID: "${VOCECHAT_BOT_TARGET_GROUP_ID:-}",
  VOCECHAT_BOT_INFO_ENABLED: "${bot_info_enabled}"
};
EOF

cat > /etc/nginx/jellyfin-proxy.inc << EOF
EOF

if [ -n "${JELLYFIN_HOST:-}" ] && [ -n "${JELLYFIN_TOKEN:-}" ]; then
  jellyfin_host="${JELLYFIN_HOST%/}"
  cat > /etc/nginx/jellyfin-proxy.inc << EOF
location = /jellyfin {
    return 301 /jellyfin/;
}

location /jellyfin/ {
    proxy_pass ${jellyfin_host}/;
    proxy_ssl_server_name on;
    proxy_set_header Host \$proxy_host;
    proxy_set_header X-Emby-Token "${JELLYFIN_TOKEN}";
    proxy_redirect off;
}
EOF
fi

cat > /etc/nginx/bot-proxy.inc << EOF
EOF

if [ -n "${VOCECHAT_BOT_API_KEY:-}" ]; then
  vocechat_host="${VOCECHAT_HOST:-https://chat.gnomguttan.no}"
  vocechat_host="${vocechat_host%/}"
  cat > /etc/nginx/bot-proxy.inc << EOF
location = /bot {
    return 301 /bot/;
}

location /bot/ {
    proxy_pass ${vocechat_host}/api/bot/;
    proxy_ssl_server_name on;
    proxy_set_header Host \$proxy_host;
    proxy_set_header X-API-Key "${VOCECHAT_BOT_API_KEY}";
    proxy_redirect off;
}
EOF
fi

exec "$@"
