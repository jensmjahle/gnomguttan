import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import https from 'node:https';

function createAgent(target: string) {
  return target.startsWith('https://') ? new https.Agent({ family: 4 }) : undefined;
}

function buildRuntimeEnvJs(env: {
  vocechatHost: string;
  appTitle: string;
  jellyfinClientUrl: string;
  botTargetGroupId: string;
  botInfoEnabled: boolean;
}) {
  return `window.__APP_ENV__ = ${JSON.stringify({
    VOCECHAT_HOST: env.vocechatHost,
    APP_TITLE: env.appTitle,
    JELLYFIN_CLIENT_URL: env.jellyfinClientUrl,
    VOCECHAT_BOT_TARGET_GROUP_ID: env.botTargetGroupId,
    VOCECHAT_BOT_INFO_ENABLED: env.botInfoEnabled ? 'true' : 'false',
  })};\n`;
}

function runtimeEnvPlugin(env: {
  vocechatHost: string;
  appTitle: string;
  jellyfinClientUrl: string;
  botTargetGroupId: string;
  botInfoEnabled: boolean;
}) {
  const js = buildRuntimeEnvJs(env);
  return {
    name: 'runtime-env-js',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url !== '/env.js') {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Cache-Control', 'no-store');
        res.end(js);
      });
    },
    configurePreviewServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url !== '/env.js') {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Cache-Control', 'no-store');
        res.end(js);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const vocechatTarget = env.VOCECHAT_HOST ?? process.env.VOCECHAT_HOST ?? 'https://chat.gnomguttan.no';
  const botTargetGroupId = env.VOCECHAT_BOT_TARGET_GROUP_ID ?? process.env.VOCECHAT_BOT_TARGET_GROUP_ID ?? '';
  const botApiKey = env.VOCECHAT_BOT_API_KEY ?? process.env.VOCECHAT_BOT_API_KEY ?? '';
  const jellyfinTarget = env.JELLYFIN_HOST ?? process.env.JELLYFIN_HOST ?? '';
  const jellyfinToken = env.JELLYFIN_TOKEN ?? process.env.JELLYFIN_TOKEN ?? '';
  const appTitle = env.APP_TITLE ?? process.env.APP_TITLE ?? 'Gnomguttan';
  const jellyfinClientUrl = env.JELLYFIN_CLIENT_URL ?? process.env.JELLYFIN_CLIENT_URL ?? 'https://kino.gnomguttan.no';
  const botInfoEnabled = Boolean(botApiKey && botTargetGroupId);

  const proxy: Record<string, any> = {
    '/api': {
      target: vocechatTarget,
      changeOrigin: true,
      secure: false,
      agent: createAgent(vocechatTarget),
      proxyTimeout: 30000,
      timeout: 30000,
    },
  };

  if (botApiKey) {
    proxy['/bot'] = {
      target: vocechatTarget,
      changeOrigin: true,
      secure: false,
      agent: createAgent(vocechatTarget),
      rewrite: (path: string) => path.replace(/^\/bot/, '/api/bot'),
      proxyTimeout: 30000,
      timeout: 30000,
      configure(proxyServer: any) {
        proxyServer.on('proxyReq', (proxyReq) => {
          proxyReq.setHeader('X-API-Key', botApiKey);
        });
      },
    };
  }

  if (jellyfinTarget && jellyfinToken) {
    proxy['/jellyfin'] = {
      target: jellyfinTarget,
      changeOrigin: true,
      secure: false,
      agent: createAgent(jellyfinTarget),
      rewrite: (path: string) => path.replace(/^\/jellyfin/, ''),
      proxyTimeout: 30000,
      timeout: 30000,
      configure(proxyServer: any) {
        proxyServer.on('proxyReq', (proxyReq) => {
          proxyReq.setHeader('X-Emby-Token', jellyfinToken);
        });
      },
    };
  }

  return {
    plugins: [
      react(),
      runtimeEnvPlugin({
        vocechatHost: vocechatTarget,
        appTitle,
        jellyfinClientUrl,
        botTargetGroupId,
        botInfoEnabled,
      }),
    ],
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
    server: {
      port: 5173,
      host: true,
      proxy,
    },
  };
});
