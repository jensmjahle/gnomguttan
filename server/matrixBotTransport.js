import path from 'node:path';
import { mkdir, readFile, writeFile, rename, chmod, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export function matrixBotErrorCode(error) {
  const code = error?.errcode || error?.body?.errcode || error?.statusCode || error?.code || error?.name;
  return /^[A-Za-z0-9_ -]{1,80}$/.test(String(code)) ? String(code) : 'MATRIX_BOT_ERROR';
}
export function readMatrixBotConfig(env = process.env) {
  const enabled = /^(true|1|yes)$/i.test(env.MATRIX_BOT_ENABLED || '');
  const config = { enabled, baseUrl: (env.MATRIX_BOT_HOMESERVER_URL || env.MATRIX_HOMESERVER_URL || 'https://gnomchat.gnomguttan.no').replace(/\/$/, ''),
    username: (env.MATRIX_BOT_USERNAME || '@gnomen:gnomchat.gnomguttan.no').trim(), password: env.MATRIX_BOT_PASSWORD || '', accessToken: (env.MATRIX_BOT_ACCESS_TOKEN || '').trim(),
    roomId: (env.MATRIX_BOT_TARGET_ROOM_ID || env.MATRIX_BOT_TARGET_ROOM_ALIAS || '').trim(), storageDir: path.resolve(env.MATRIX_BOT_STORAGE_DIR || './data/matrix-bot'),
    publicUrl: (env.APP_PUBLIC_URL || 'https://gnomguttan.no').replace(/\/$/, ''),
  };
  if (!enabled) return config;
  if (config.storageDir === path.parse(config.storageDir).root) throw new Error('Matrix bot: choose a dedicated storage directory.');
  for (const [key, value] of [['homeserver URL', config.baseUrl], ['APP_PUBLIC_URL', config.publicUrl]]) {
    const url = new URL(value);
    if (url.username || url.password || url.hash || url.search || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error(`Matrix bot: invalid ${key}. Use HTTPS (or localhost for tests).`);
  }
  if (!/^![^\s/#?]+$/.test(config.roomId) && !/^#[^:\s]+:[^\s/#?]+$/.test(config.roomId)) throw new Error('Matrix bot: set a room ID or a complete Matrix room alias.');
  if (!config.username || /\s/.test(config.username)) throw new Error('Matrix bot: set MATRIX_BOT_USERNAME to the bot username or full Matrix ID.');
  return config;
}
async function loadSession(config, fetchImpl) {
  await mkdir(config.storageDir, { recursive: true, mode: 0o700 });
  await chmod(config.storageDir, 0o700);
  const sessionPath = path.join(config.storageDir, 'session.json');
  try {
    const session = JSON.parse(await readFile(sessionPath, 'utf8'));
    const localpart = session.userId?.split(':')[0]?.replace(/^@/, '');
    if (!session.accessToken || !session.deviceId || session.baseUrl !== config.baseUrl || (config.username.startsWith('@') ? config.username !== session.userId : config.username !== localpart) || (config.accessToken && config.accessToken !== session.accessToken)) {
      throw Object.assign(new Error('Bot session does not match the configuration. Restore the matching storage or use a separate storage directory for a new bot device.'), { code: 'MATRIX_BOT_SESSION_MISMATCH' });
    }
    return session;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if ((await readdir(config.storageDir)).length) throw Object.assign(new Error('Bot session is missing but the storage directory is not empty. Restore the full backup or use a new storage directory.'), { code: 'MATRIX_BOT_STORAGE_INCOMPLETE' });
  let session;
  if (config.accessToken) {
    const response = await fetchImpl(`${config.baseUrl}/_matrix/client/v3/account/whoami`, { headers: { Authorization: `Bearer ${config.accessToken}` }, signal: AbortSignal.timeout(20000) });
    const result = await response.json(); if (!response.ok) throw Object.assign(new Error('Matrix bot token was rejected.'), { code: result.errcode || 'MATRIX_BOT_AUTH_FAILED' });
    session = { baseUrl: config.baseUrl, accessToken: config.accessToken, userId: result.user_id, deviceId: result.device_id };
  } else {
    if (!config.password) throw Object.assign(new Error('Set MATRIX_BOT_PASSWORD for the first login, or supply MATRIX_BOT_ACCESS_TOKEN.'), { code: 'MATRIX_BOT_CREDENTIALS_MISSING' });
    const response = await fetchImpl(`${config.baseUrl}/_matrix/client/v3/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ type: 'm.login.password', identifier: { type: 'm.id.user', user: config.username }, password: config.password, initial_device_display_name: 'Gnomguttan informasjonsbot' }) });
    const result = await response.json(); if (!response.ok) throw Object.assign(new Error('Matrix bot login was rejected.'), { code: result.errcode || 'MATRIX_BOT_AUTH_FAILED' });
    session = { baseUrl: config.baseUrl, accessToken: result.access_token, userId: result.user_id, deviceId: result.device_id };
  }
  if (!session.accessToken || !session.userId || !session.deviceId) throw Object.assign(new Error('Matrix bot needs a token belonging to a persistent device.'), { code: 'MATRIX_BOT_DEVICE_MISSING' });
  const localpart = session.userId.split(':')[0].replace(/^@/, '');
  if (config.username.startsWith('@') ? config.username !== session.userId : config.username !== localpart) throw Object.assign(new Error('The token belongs to a different user.'), { code: 'MATRIX_BOT_SESSION_MISMATCH' });
  const temporaryPath = `${sessionPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(session), { mode: 0o600 }); await rename(temporaryPath, sessionPath); await chmod(sessionPath, 0o600);
  return session;
}
export async function createMatrixBotTransport(config, { fetchImpl = fetch, sdkLoader = async () => { const [sdk, crypto] = await Promise.all([import('matrix-bot-sdk'), import('@matrix-org/matrix-sdk-crypto-nodejs')]); return { ...sdk, StoreType: crypto.StoreType }; }, logger = console } = {}) {
  const sdk = await sdkLoader();
  // SDK error objects can include HTTP request headers. Never forward those objects to logs.
  sdk.LogService.setLevel(sdk.LogLevel.WARN);
  sdk.LogService.setLogger({ trace() {}, debug() {}, info() {}, warn(module) { logger.warn(`[MatrixBot/${module}] SDK warning.`); }, error(module) { logger.error(`[MatrixBot/${module}] SDK error.`); } });
  const session = await loadSession(config, fetchImpl);
  const storage = new sdk.SimpleFsStorageProvider(path.join(config.storageDir, 'sync.json'));
  const crypto = new sdk.RustSdkCryptoStorageProvider(path.join(config.storageDir, 'crypto'), sdk.StoreType.Sqlite);
  const client = new sdk.MatrixClient(config.baseUrl, session.accessToken, storage, crypto);
  let targetRoomId;
  try {
    targetRoomId = await client.resolveRoom(config.roomId);
    const who = await client.getWhoAmI();
    if (who.user_id !== session.userId || who.device_id !== session.deviceId) throw Object.assign(new Error('Matrix bot device changed.'), { code: 'MATRIX_BOT_DEVICE_MISMATCH' });
    const joined = await client.getJoinedRooms();
    if (!joined.includes(targetRoomId)) await client.joinRoom(targetRoomId);
    if ((await client.getRoomStateEvent(targetRoomId, 'm.room.create', '')).type === 'm.space') throw Object.assign(new Error('Choose a conversation room, not a space.'), { code: 'MATRIX_BOT_TARGET_IS_SPACE' });
    await client.start({ room: { rooms: [targetRoomId], timeline: { limit: 0 } } });
  } catch (error) { client.stop(); throw error; }
  logger.info(`[MatrixBot] Connected as ${session.userId}, device ${session.deviceId}, target ${targetRoomId}.`);
  async function encryptionState(roomId) {
    try { return await client.getRoomStateEvent(roomId, 'm.room.encryption', ''); }
    catch (error) { if (error?.body?.errcode === 'M_NOT_FOUND' || error?.errcode === 'M_NOT_FOUND') return null; throw error; }
  }
  return {
    async prepare(roomId, content, previous) {
      roomId = roomId === config.roomId ? targetRoomId : roomId;
      if (previous?.roomId && previous.roomId !== roomId) throw Object.assign(new Error('The room alias points to a different room than this prepared notice.'), { code: 'MATRIX_BOT_TARGET_CHANGED' });
      const state = await encryptionState(roomId);
      if (!state) {
        // Once ciphertext has been prepared, never downgrade it to plaintext.
        return previous || { roomId, type: 'm.room.message', content };
      }
      if (state.algorithm !== 'm.megolm.v1.aes-sha2') throw Object.assign(new Error('Unsupported room encryption.'), { code: 'MATRIX_BOT_UNSUPPORTED_ENCRYPTION' });
      if (previous?.type === 'm.room.encrypted') return previous;
      await client.crypto.onRoomJoin(roomId);
      return { roomId, type: 'm.room.encrypted', content: await client.crypto.encryptRoomEvent(roomId, 'm.room.message', content) };
    },
    async send(roomId, prepared, transactionId) {
      roomId = roomId === config.roomId ? targetRoomId : roomId;
      if (prepared.roomId && prepared.roomId !== roomId) throw Object.assign(new Error('Prepared notice belongs to a different room.'), { code: 'MATRIX_BOT_TARGET_CHANGED' });
      // A stable transaction ID makes retrying a lost HTTP response idempotent.
      const endpoint = `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${encodeURIComponent(prepared.type)}/${encodeURIComponent(transactionId)}`;
      const response = await client.doRequest('PUT', endpoint, null, prepared.content, 20000);
      if (!response.event_id) throw Object.assign(new Error('Matrix did not return an event ID.'), { code: 'MATRIX_BOT_SEND_FAILED' });
      return response.event_id;
    },
    stop() { client.stop(); },
  };
}
