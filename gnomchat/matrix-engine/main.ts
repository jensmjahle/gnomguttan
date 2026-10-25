import { createClient, ClientEvent, RoomEvent, RoomMemberEvent, MatrixEventEvent, EventType } from 'matrix-js-sdk';
import { initAsync } from '@matrix-org/matrix-sdk-crypto-wasm';
import { decodeRecoveryKey, CryptoEvent, VerificationPhase, VerificationRequestEvent, VerifierEvent } from 'matrix-js-sdk/lib/crypto-api';
import { encryptAttachment, decryptAttachment } from 'matrix-encrypt-attachment';

// This is a local, headless protocol/crypto worker. It renders no website or UI.
const post = (data: unknown) => (window as any).ReactNativeWebView?.postMessage(JSON.stringify(data));
let client: any = null;
let session: any = null;
let roomId = '';
let visible = false;
let secretKey: Uint8Array | null = null;
let generation = 0;
let verification: any = null;
let verifier: any = null;
let sas: any = null;
function showSas(value: any) { sas = value; verificationState(); }
function verificationState() {
  if (!verification) return;
  if (verification.verifier && verifier !== verification.verifier) {
    verifier?.off(VerifierEvent.ShowSas, showSas); verifier = verification.verifier;
    verifier.on(VerifierEvent.ShowSas, showSas); sas = verifier.getShowSasCallbacks();
    void verifier.verify().catch((error: any) => post({ type: 'error', error: error.message }));
  }
  const phases: Record<number, string> = { [VerificationPhase.Requested]: 'requested', [VerificationPhase.Ready]: 'ready',
    [VerificationPhase.Started]: 'started', [VerificationPhase.Done]: 'done', [VerificationPhase.Cancelled]: 'cancelled' };
  post({ type: 'verification', verification: { phase: phases[verification.phase] || 'waiting', incoming: !verification.initiatedByMe,
    device: verification.otherDeviceId || '', emoji: sas?.sas?.emoji || [], decimal: sas?.sas?.decimal || [] } });
}
function setVerification(request: any) {
  verification?.off(VerificationRequestEvent.Change, verificationState);
  verifier?.off(VerifierEvent.ShowSas, showSas); verifier = null; sas = null;
  verification = request;
  verification?.on(VerificationRequestEvent.Change, verificationState);
  verificationState();
}
let updateTimer: ReturnType<typeof setTimeout> | undefined;
function messages(room: any) {
  const timeline = room?.getLiveTimeline().getEvents() || [];
  const reactions = new Map<string, Map<string, any[]>>();
  for (const event of timeline) {
    if (event.getType() !== 'm.reaction' || event.isRedacted()) continue;
    const relation = event.getContent()['m.relates_to'];
    if (!relation?.event_id || !relation.key) continue;
    if (!reactions.has(relation.event_id)) reactions.set(relation.event_id, new Map());
    const keys = reactions.get(relation.event_id)!;
    keys.set(relation.key, [...(keys.get(relation.key) || []), event]);
  }
  const edits = new Map<string, any>();
  for (const event of timeline) {
    const content = event.getContent();
    if (content['m.relates_to']?.rel_type !== 'm.replace') continue;
    const original = timeline.find((candidate: any) => candidate.getId() === content['m.relates_to'].event_id);
    if (original?.getSender() === event.getSender()) edits.set(original.getId(), content['m.new_content']);
  }
  return timeline.filter((event: any) => ['m.room.message', 'm.room.encrypted'].includes(event.getType()) &&
    event.getContent()['m.relates_to']?.rel_type !== 'm.replace').map((event: any) => {
    const content = edits.get(event.getId()) || event.getContent();
    return {
      id: event.getId(), sender: event.getSender(), senderName: room.getMember(event.getSender())?.name || event.getSender(),
      avatar: room.getMember(event.getSender())?.events?.member?.getContent()?.avatar_url,
      body: event.isRedacted() ? 'Meldingen er slettet' : event.getType() === 'm.room.encrypted' ? 'Kryptert melding – venter på nøkkel' : content.body || '',
      timestamp: event.getTs(), msgtype: content.msgtype || 'm.text', encrypted: event.isEncrypted(), redacted: event.isRedacted(),
      pending: ['sending', 'queued', 'encrypting'].includes(event.status), failed: event.status === 'not_sent',
      ...(content.url || content.file ? { media: { url: content.url, file: content.file, mimetype: content.info?.mimetype, name: content.body || 'Vedlegg' } } : {}),
      reactions: [...(reactions.get(event.getId()) || new Map()).entries()].map(([key, events]: any) => ({
        key, count: events.length, mine: events.some((reaction: any) => reaction.getSender() === session?.userId),
        eventIds: events.filter((reaction: any) => reaction.getSender() === session?.userId).map((reaction: any) => reaction.getId()),
      })),
      readBy: room.getUsersReadUpTo(event).filter((id: string) => id !== session?.userId).map((id: string) => room.getMember(id)?.name || id),
    };
  });
}
function snapshot() {
  if (!client) return;
  const directs = new Set(Object.values(client.getAccountData(EventType.Direct)?.getContent() || {}).flat());
  const rooms = client.getRooms().filter((room: any) => ['join', 'invite'].includes(room.getMyMembership()) && room.getType() !== 'm.space')
    .map((room: any) => {
      const last = room.getLiveTimeline().getEvents().filter((event: any) => event.getType() === 'm.room.message').at(-1);
      return { id: room.roomId, name: room.name, direct: directs.has(room.roomId), membership: room.getMyMembership(),
        unread: room.getUnreadNotificationCount(), encrypted: client.isRoomEncrypted(room.roomId),
        lastActivity: room.getLastActiveTimestamp(), preview: last?.getContent()?.body || '',
        avatar: room.currentState?.getStateEvents('m.room.avatar', '')?.getContent()?.url };
    }).sort((a: any, b: any) => b.lastActivity - a.lastActivity);
  const room = client.getRoom(roomId);
  post({ type: 'snapshot', userId: session.userId, rooms, roomId, messages: messages(room),
    typing: room?.getMembers().filter((member: any) => member.typing && member.userId !== session.userId).map((member: any) => member.name) || [] });
}
function scheduleSnapshot() {
  if (updateTimer) return;
  updateTimer = setTimeout(() => { updateTimer = undefined; snapshot(); }, 80);
}
async function start(next: any) {
  const version = ++generation;
  setVerification(null);
  client?.stopClient(); client?.removeAllListeners();
  session = next; secretKey = null;
  post({ type: 'status', status: 'Klargjør kryptering …' });
  const connection: any = createClient({ ...next, verificationMethods: ['m.sas.v1'], cryptoCallbacks: {
    getSecretStorageKey: async ({ keys }: any) => {
      const id = await connection.secretStorage.getDefaultKeyId();
      return id && keys[id] && secretKey ? [id, secretKey] : null;
    },
  } });
  client = connection;
  await initAsync();
  await connection.initRustCrypto({ cryptoDatabasePrefix: `gnomchat-native-${encodeURIComponent(`${next.baseUrl}|${next.userId}|${next.deviceId}`)}` });
  if (version !== generation) { connection.stopClient(); return; }
  connection.on(CryptoEvent.VerificationRequestReceived, (request: any) => { if (request.isSelfVerification) setVerification(request); });
  connection.on(ClientEvent.Sync, (state: string, _previous: unknown, data: any) => {
    if (data?.error?.errcode === 'M_UNKNOWN_TOKEN') post({ type: 'expired' });
    post({ type: 'status', status: ['PREPARED', 'SYNCING'].includes(state) ? 'Tilkoblet' : state === 'ERROR' ? 'Mistet forbindelsen. Prøver igjen …' : 'Synkroniserer …' });
    scheduleSnapshot();
  });
  for (const event of [ClientEvent.AccountData, RoomEvent.Timeline, RoomEvent.Name, RoomEvent.MyMembership,
    RoomEvent.LocalEchoUpdated, RoomEvent.Receipt, RoomMemberEvent.Typing, MatrixEventEvent.Decrypted]) connection.on(event, scheduleSnapshot);
  await connection.startClient({ initialSyncLimit: 60 });
  snapshot();
}
async function media(content: any) {
  const mxc = content.file?.url || content.url;
  if (typeof mxc !== 'string' || !mxc.startsWith('mxc://')) throw new Error('Ugyldig vedlegg.');
  const [server, ...parts] = mxc.slice(6).split('/');
  const response = await fetch(`${session.baseUrl}/_matrix/client/v1/media/download/${encodeURIComponent(server)}/${encodeURIComponent(parts.join('/'))}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok) throw new Error(`Kunne ikke laste vedlegget (${response.status}).`);
  let data = await response.arrayBuffer();
  if (data.byteLength > 30 * 1024 * 1024) throw new Error('Vedlegget er for stort til forhåndsvisning i appen (maks 30 MB).');
  if (content.file) data = await decryptAttachment(data, content.file);
  const blob = new Blob([data], { type: content.mimetype || 'application/octet-stream' });
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Kunne ikke lese vedlegget.')); reader.readAsDataURL(blob); });
}
const commands: Record<string, (args: any) => any> = {
  async login({ baseUrl, username, password }) {
    const result = await createClient({ baseUrl }).login('m.login.password', {
      identifier: { type: 'm.id.user', user: username }, password, initial_device_display_name: 'GnomChat mobil',
    });
    return { baseUrl, accessToken: result.access_token, userId: result.user_id, deviceId: result.device_id };
  },
  start,
  async logout() { ++generation; try { await client?.logout(); } finally { setVerification(null); client?.stopClient(); client?.removeAllListeners(); client = null; session = null; secretKey = null; roomId = ''; } },
  refresh() { snapshot(); },
  open({ id }) { roomId = id; snapshot(); },
  visibility({ active }) { visible = active; },
  async history() { const room = client?.getRoom(roomId); if (room) await client.scrollback(room, 40); snapshot(); },
  async send({ id, body, replyTo, editId }) {
    const content: any = { msgtype: 'm.text', body };
    if (replyTo) content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyTo } };
    if (editId) { content['m.new_content'] = { ...content }; content['m.relates_to'] = { rel_type: 'm.replace', event_id: editId }; content.body = `* ${body}`; }
    await client.sendMessage(id, content); snapshot();
  },
  async upload({ id, base64, name, mimetype, msgtype }) {
    const raw = Uint8Array.from(atob(base64), char => char.charCodeAt(0)).buffer;
    let file: any; let blob: Blob;
    if (client.isRoomEncrypted(id)) {
      const encrypted = await encryptAttachment(raw); file = encrypted.info; blob = new Blob([encrypted.data]);
    } else blob = new Blob([raw], { type: mimetype });
    const uploaded = await client.uploadContent(blob, { name, type: file ? 'application/octet-stream' : mimetype });
    await client.sendMessage(id, { msgtype, body: name, info: { mimetype, size: raw.byteLength },
      ...(file ? { file: { ...file, url: uploaded.content_uri } } : { url: uploaded.content_uri }) }); snapshot();
  },
  media,
  async read({ id, eventId }) {
    if (!visible || id !== roomId) return;
    const room = client?.getRoom(id); const event = room?.findEventById(eventId);
    if (event && !event.status) { await client.sendReadReceipt(event); await client.setRoomReadMarkers(id, eventId); }
  },
  typing({ id, typing }) { return client?.sendTyping(id, typing, 5000); },
  async react({ id, eventId, key, removeIds }) {
    if (removeIds?.length) await Promise.all(removeIds.map((event: string) => client.redactEvent(id, event)));
    else await client.sendEvent(id, 'm.reaction', { 'm.relates_to': { rel_type: 'm.annotation', event_id: eventId, key } }); snapshot();
  },
  async remove({ id, eventId }) { await client.redactEvent(id, eventId); snapshot(); },
  async join({ id }) { await client.joinRoom(id); snapshot(); },
  async conversation({ target, encrypted = true }) {
    if (target.startsWith('@')) {
      const directs = client.getAccountData(EventType.Direct)?.getContent() || {};
      const existing = (directs[target] || []).find((id: string) => client.getRoom(id)?.getMyMembership() === 'join');
      if (existing) return existing;
      const result = await client.createRoom({ is_direct: true, invite: [target], preset: 'trusted_private_chat',
        ...(encrypted ? { initial_state: [{ type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }] } : {}) });
      await client.setAccountData(EventType.Direct, { ...directs, [target]: [...(directs[target] || []), result.room_id] });
      snapshot(); return result.room_id;
    }
    const joined = await client.joinRoom(target); snapshot(); return joined.roomId;
  },
  async leave({ id }) { await client.leave(id); snapshot(); },
  pusher(args) { return client.setPusher(args); },
  async verify({ action }) {
    if (action === 'request') setVerification(await client.getCrypto().requestOwnUserVerification());
    else if (action === 'accept') await verification?.accept();
    else if (action === 'start') await verification?.startVerification('m.sas.v1');
    else if (action === 'confirm') await sas?.confirm();
    else if (action === 'mismatch') sas?.mismatch();
    else if (action === 'cancel') await verification?.cancel();
    verificationState();
  },
  async recover({ key }) {
    try {
      secretKey = decodeRecoveryKey(key.trim());
      const keyId = await client.secretStorage.getDefaultKeyId();
      if (!keyId || !await client.secretStorage.checkKey(secretKey, (await client.secretStorage.getKey(keyId))![1])) throw new Error('Gjenopprettingsnøkkelen passer ikke til kontoen.');
      const crypto = client.getCrypto();
      if (await crypto.userHasCrossSigningKeys()) await crypto.bootstrapCrossSigning({ setupNewCrossSigning: false });
      await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      const result = await crypto.restoreKeyBackup();
      await Promise.all(client.getRooms().flatMap((room: any) => room.getLiveTimeline().getEvents()).filter((event: any) => event.isDecryptionFailure())
        .map((event: any) => client.decryptEventIfNeeded(event).catch(() => undefined)));
      snapshot(); return result.imported;
    } finally { secretKey = null; }
  },
};
(window as any).__gnomMatrixCommand = async ({ id, method, args }: any) => {
  try {
    if (!commands[method]) throw new Error('Ukjent Matrix-operasjon.');
    const result = await commands[method](args || {}); post({ type: 'response', id, result: result ?? null });
  } catch (error: any) { post({ type: 'response', id, error: error.errcode === 'M_FORBIDDEN' ? 'Feil brukernavn/passord eller manglende tilgang.' : error.message || 'Matrix-operasjonen feilet.' }); }
};
window.addEventListener('unhandledrejection', event => post({ type: 'error', error: event.reason?.message || 'Matrix mistet forbindelsen.' }));
post({ type: 'ready' });
