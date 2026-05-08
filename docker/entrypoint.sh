#!/bin/sh
set -e

# Inject runtime environment into env.js so the SPA reads it at startup.
# Set these in your docker-compose.yml environment section.
cat > /usr/share/nginx/html/env.js << EOF
window.__APP_ENV__ = {
  VOCECHAT_HOST: "${VOCECHAT_HOST:-https://chat.gnomguttan.no}",
  APP_TITLE: "${APP_TITLE:-Gnomguttan}"
};
EOF

exec "$@"
