import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import https from 'node:https';
function createAgent(target) {
    return target.startsWith('https://') ? new https.Agent({ family: 4 }) : undefined;
}
function buildRuntimeEnvJs(env) {
    return "window.__APP_ENV__ = ".concat(JSON.stringify({
        VOCECHAT_HOST: env.vocechatHost,
        APP_TITLE: env.appTitle,
        JELLYFIN_CLIENT_URL: env.jellyfinClientUrl,
        VOCECHAT_BOT_TARGET_GROUP_ID: env.botTargetGroupId,
        VOCECHAT_BOT_INFO_ENABLED: env.botInfoEnabled ? 'true' : 'false',
    }), ";\n");
}
function runtimeEnvPlugin(env) {
    var js = buildRuntimeEnvJs(env);
    return {
        name: 'runtime-env-js',
        configureServer: function (server) {
            server.middlewares.use(function (req, res, next) {
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
        configurePreviewServer: function (server) {
            server.middlewares.use(function (req, res, next) {
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
export default defineConfig(function (_a) {
    var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var vocechatTarget = (_c = (_b = env.VOCECHAT_HOST) !== null && _b !== void 0 ? _b : process.env.VOCECHAT_HOST) !== null && _c !== void 0 ? _c : 'https://chat.gnomguttan.no';
    var appApiTarget = (_e = (_d = env.APP_API_TARGET) !== null && _d !== void 0 ? _d : process.env.APP_API_TARGET) !== null && _e !== void 0 ? _e : 'http://localhost:3001';
    var botTargetGroupId = (_g = (_f = env.VOCECHAT_BOT_TARGET_GROUP_ID) !== null && _f !== void 0 ? _f : process.env.VOCECHAT_BOT_TARGET_GROUP_ID) !== null && _g !== void 0 ? _g : '';
    var botApiKey = (_j = (_h = env.VOCECHAT_BOT_API_KEY) !== null && _h !== void 0 ? _h : process.env.VOCECHAT_BOT_API_KEY) !== null && _j !== void 0 ? _j : '';
    var jellyfinTarget = (_l = (_k = env.JELLYFIN_HOST) !== null && _k !== void 0 ? _k : process.env.JELLYFIN_HOST) !== null && _l !== void 0 ? _l : '';
    var jellyfinToken = (_o = (_m = env.JELLYFIN_TOKEN) !== null && _m !== void 0 ? _m : process.env.JELLYFIN_TOKEN) !== null && _o !== void 0 ? _o : '';
    var appTitle = (_q = (_p = env.APP_TITLE) !== null && _p !== void 0 ? _p : process.env.APP_TITLE) !== null && _q !== void 0 ? _q : 'Gnomguttan';
    var jellyfinClientUrl = (_s = (_r = env.JELLYFIN_CLIENT_URL) !== null && _r !== void 0 ? _r : process.env.JELLYFIN_CLIENT_URL) !== null && _s !== void 0 ? _s : 'https://kino.gnomguttan.no';
    var botInfoEnabled = Boolean(botApiKey && botTargetGroupId);
    var proxy = {
        '/app-api/olbors/stream': { target: appApiTarget, changeOrigin: true, timeout: 0, proxyTimeout: 0 },
        '/olbors-media': { target: appApiTarget, changeOrigin: true },
        '/api': {
            target: vocechatTarget,
            changeOrigin: true,
            secure: false,
            agent: createAgent(vocechatTarget),
            proxyTimeout: 30000,
            timeout: 30000,
        },
        '/app-api/meow/events': {
            target: appApiTarget,
            changeOrigin: true,
            secure: false,
            // No timeout — SSE connection must stay open indefinitely.
        },
        '/app-api': {
            target: appApiTarget,
            changeOrigin: true,
            secure: false,
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
            rewrite: function (path) { return path.replace(/^\/bot/, '/api/bot'); },
            proxyTimeout: 30000,
            timeout: 30000,
            configure: function (proxyServer) {
                proxyServer.on('proxyReq', function (proxyReq) {
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
            rewrite: function (path) { return path.replace(/^\/jellyfin/, ''); },
            proxyTimeout: 30000,
            timeout: 30000,
            configure: function (proxyServer) {
                proxyServer.on('proxyReq', function (proxyReq) {
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
                appTitle: appTitle,
                jellyfinClientUrl: jellyfinClientUrl,
                botTargetGroupId: botTargetGroupId,
                botInfoEnabled: botInfoEnabled,
            }),
        ],
        resolve: {
            alias: { '@': resolve(__dirname, 'src') },
        },
        server: {
            port: 5173,
            host: true,
            proxy: proxy,
        },
        preview: {
            host: true,
            proxy: proxy,
        },
    };
});
