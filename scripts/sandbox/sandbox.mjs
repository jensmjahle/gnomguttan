// Local sandbox for trying the app without a database, chat account or any real services:
//   in-memory MongoDB (seeded with test users, posts, comments and notifications)
//   + a fake VoceChat (log in as any test user with any password)
//   + the real API server + Vite.
// Nothing talks to the real database, chat, GitHub, Home Assistant or Jellyfin.
//
//   npm run sandbox
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { computeBumpTargets } from '../../server/comments.js';
import { runActivity } from './activity.mjs';
import { startFakeVoceChat } from './fake-vocechat.mjs';
import { seed, USERS } from './seed.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const API_PORT = 3001;
const WEB_PORT = 5173;
const VOCECHAT_PORT = 39555;
const vocechatUrl = `http://127.0.0.1:${VOCECHAT_PORT}`;
const children = [];

const memory = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
const mongoUri = memory.getUri();
const dbName = 'gnomguttan-sandbox';
const client = new MongoClient(mongoUri);
await client.connect();
const summary = await seed(client.db(dbName), { computeBumpTargets, ObjectId });
await client.close();
console.log(`[sandbox] Seeded ${summary.posts} posts, ${summary.comments} comments, ${summary.replies} replies, ${summary.bumps} bumps`);

const fake = await startFakeVoceChat({ users: USERS, port: VOCECHAT_PORT });
console.log(`[sandbox] Fake VoceChat on ${vocechatUrl}`);

// Empty values win over .env because dotenv/Vite never override variables that are already set.
const isolatedEnv = {
  ...process.env,
  MONGODB_URI: mongoUri,
  MONGODB_DB: dbName,
  VOCECHAT_HOST: vocechatUrl,
  VOCECHAT_BOT_API_KEY: 'sandbox-bot-key',
  VOCECHAT_BOT_TARGET_GROUP_ID: '',
  GITHUB_TOKEN: '',
  GITHUB_WEBHOOK_SECRET: '',
  HOME_ASSISTANT_URL: '',
  HOME_ASSISTANT_TOKEN: '',
  JELLYFIN_HOST: '',
  JELLYFIN_TOKEN: '',
  MATRIX_BOT_ENABLED: 'false',
  APP_PUBLIC_URL: `http://localhost:${WEB_PORT}`,
  APP_API_TARGET: `http://127.0.0.1:${API_PORT}`,
  PORT: String(API_PORT),
};

function start(name, args, env) {
  const child = spawn(process.execPath, args, { cwd: projectDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = (chunk) => chunk.toString().replace(/^(?=.)/gm, `[${name}] `);
  child.stdout.on('data', (chunk) => process.stdout.write(prefix(chunk)));
  child.stderr.on('data', (chunk) => process.stderr.write(prefix(chunk)));
  child.on('exit', (code) => {
    console.log(`[sandbox] ${name} exited (${code})`);
    void shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

start('api', ['server/index.js'], isolatedEnv);

// Once the API is up, generate some live activity so there are notifications to look at.
void (async () => {
  const apiBase = `http://127.0.0.1:${API_PORT}/app-api`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await fetch(`${apiBase}/health`).then((res) => res.ok).catch(() => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  try {
    await runActivity(apiBase, { eventId: summary.eventId });
    console.log('[sandbox] Generated live activity (mentions, replies, reactions, a new event) → notifications');
  } catch (error) {
    console.error('[sandbox] Could not generate activity:', error.message);
  }
})();

start('web', [path.join(projectDir, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], {
  ...isolatedEnv,
  VOCECHAT_BOT_API_KEY: '',
});

let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  fake.closeAllConnections?.();
  fake.close();
  await memory.stop().catch(() => {});
  process.exit(code);
}
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

console.log(`
[sandbox] ─────────────────────────────────────────────
[sandbox] Open http://localhost:${WEB_PORT}
[sandbox] Log in with any password as:
${USERS.map((user) => `[sandbox]   ${user.email.padEnd(16)} ${user.name}${user.isAdmin ? ' (admin)' : ''}`).join('\n')}
[sandbox] Event page: http://localhost:${WEB_PORT}/arrangementer/${summary.eventId}
[sandbox] Stop with Ctrl+C. Data lives in memory and is gone afterwards.
[sandbox] ─────────────────────────────────────────────
`);
