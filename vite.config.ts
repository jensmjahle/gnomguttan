import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import https from 'node:https';

const vocechatAgent = new https.Agent({ family: 4 });

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: process.env.VOCECHAT_HOST ?? 'https://chat.gnomguttan.no',
        changeOrigin: true,
        secure: false,
        agent: vocechatAgent,
        proxyTimeout: 30000,
        timeout: 30000,
      },
    },
  },
});
