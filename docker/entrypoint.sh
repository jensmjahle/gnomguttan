#!/bin/sh
set -e

# Inject runtime environment into env.js so the SPA reads it at startup.
# Set these in your docker-compose.yml environment section.
cat > /usr/share/nginx/html/env.js << EOF
window.__APP_ENV__ = {
  VOCECHAT_HOST: "${VOCECHAT_HOST:-https://chat.gnomguttan.no}",
  APP_TITLE: "${APP_TITLE:-Gnomguttan}",
  JELLYFIN_CLIENT_URL: "${JELLYFIN_CLIENT_URL:-https://kino.gnomguttan.no}"
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

exec "$@"
