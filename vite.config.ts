import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import https from 'node:https';

function createAgent(target: string) {
  return target.startsWith('https://') ? new https.Agent({ family: 4 }) : undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const vocechatTarget = env.VOCECHAT_HOST ?? process.env.VOCECHAT_HOST ?? 'https://chat.gnomguttan.no';
  const jellyfinTarget = env.JELLYFIN_HOST ?? process.env.JELLYFIN_HOST ?? '';
  const jellyfinToken = env.JELLYFIN_TOKEN ?? process.env.JELLYFIN_TOKEN ?? '';

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
    plugins: [react()],
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
