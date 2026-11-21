import Constants from 'expo-constants';

type ExtraConfig = { appApiHost?: string; matrixHomeserverUrl?: string; matrixEngineUrl?: string } | undefined;
const extra = Constants.expoConfig?.extra as ExtraConfig;

/** Priority: EXPO_PUBLIC_ env (inlined at build) → app.config extra → default. */
function pick(env: string | undefined, fromExtra: string | undefined, fallback: string) {
  return (env?.trim() || fromExtra?.trim() || fallback).replace(/\/+$/, '');
}

const appApiHost = pick(process.env.EXPO_PUBLIC_APP_API_HOST, extra?.appApiHost, 'https://gnomguttan.no');

export const config = {
  /** The Gnomguttan website and its /app-api backend: login, feed, events, albums, … */
  appApiHost,
  /** The Matrix homeserver for the chat. */
  matrixHomeserverUrl: pick(process.env.EXPO_PUBLIC_MATRIX_HOMESERVER_URL, extra?.matrixHomeserverUrl, 'https://gnomchat.gnomguttan.no'),
  /** The hidden page that runs the encrypted Matrix client (served by the website). */
  matrixEngineUrl: pick(process.env.EXPO_PUBLIC_MATRIX_ENGINE_URL, extra?.matrixEngineUrl, `${appApiHost}/matrix-engine.html`),
  /** The app id GnomChat registers its Matrix pusher under (see server/matrixPushGateway.js). */
  matrixPushAppId: 'no.gnomguttan.gnomchat',
  jellyfinClientUrl: 'https://kino.gnomguttan.no',
  busUrl: 'https://vis-tavla.entur.no/mtrSJAbxWoDvk9EOMG7I',
  bryggeriUrl: 'https://bryggeri.gnomguttan.no/',
} as const;
