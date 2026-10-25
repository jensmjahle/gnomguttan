import { createClient, ClientEvent, RoomEvent, RoomMemberEvent, MatrixEventEvent, EventType } from 'matrix-js-sdk';
import { initAsync } from '@matrix-org/matrix-sdk-crypto-wasm';
import { decodeRecoveryKey, deriveRecoveryKeyFromPassphrase, CryptoEvent, VerificationPhase, VerificationRequestEvent, VerifierEvent } from 'matrix-js-sdk/lib/crypto-api';
import { normalizeRecoveryKey } from './recovery';
import { firstUnreadId } from './unread';
import { encryptAttachment, decryptAttachment } from 'matrix-encrypt-attachment';
import { markdownContent } from '../../src/services/matrixMarkdown';
import { isDisplayMessage, makeEmojiSticker, uploadMatrixFile } from '../../src/services/matrixMedia';
import { parseGeoUri } from '../../src/services/matrixLocation';
import { makeLocationContent } from 'matrix-js-sdk/lib/content-helpers';
import { Poll, PollEvent } from 'matrix-js-sdk/lib/models/poll';
import { PollStartEvent } from 'matrix-js-sdk/lib/extensible_events_v1/PollStartEvent';
import { PollResponseEvent } from 'matrix-js-sdk/lib/extensible_events_v1/PollResponseEvent';
import { PollEndEvent } from 'matrix-js-sdk/lib/extensible_events_v1/PollEndEvent';
import { M_POLL_KIND_DISCLOSED } from 'matrix-js-sdk/lib/@types/polls';

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
const polls = new Map<string, { model: any; responses: any[]; error?: string; loading: boolean }>();
const reactionCache = new Map<string, any[]>();
let recorder: MediaRecorder | null = null;
let microphone: MediaStream | null = null;
let voiceBlob: Blob | null = null;
let voiceStarted = 0;
let voiceDuration = 0;
let voiceGeneration = 0;
const pendingDMs = new Map<string, string>();
function stopMicrophone() { microphone?.getTracks().forEach(track => track.stop()); microphone = null; }
function roomDetails(id: string) {
  const room = client.getRoom(id);
  if (!room) throw new Error('Rommet er ikke tilgjengelig.');
  const state = (type: string) => room.currentState.getStateEvents(type, '')?.getContent() || {};
  return { id, name: room.name, topic: state('m.room.topic').topic || '', avatar: state('m.room.avatar').url,
    alias: room.getCanonicalAlias(), encrypted: client.isRoomEncrypted(id), space: room.getType() === 'm.space',
    joinRule: room.getJoinRule(), history: room.getHistoryVisibility(), muted: client.getRoomPushRule('global', id)?.actions.includes('dont_notify') === true,
    canInvite: room.canInvite(session.userId), permissions: Object.fromEntries(['name', 'topic', 'avatar', 'join_rules', 'history_visibility', 'encryption'].map(key => [key, room.currentState.maySendStateEvent(`m.room.${key}`, session.userId)])),
    mayAddChild: room.currentState.maySendStateEvent('m.space.child', session.userId),
    members: room.getMembers().filter((member: any) => ['join', 'invite'].includes(member.membership)).map((member: any) => ({
      id: member.userId, name: member.name, avatar: member.getMxcAvatarUrl(), membership: member.membership, power: member.powerLevel,
    })) };
}
async function profile({ userId = session.userId }: any = {}) {
  const value = await client.getProfileInfo(userId);
  return { id: userId, name: value.displayname || userId, avatar: value.avatar_url, ...(userId === session.userId ? { deviceId: session.deviceId } : {}) };
}
async function uploadAvatar(args: any) {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(args.mimetype)) throw new Error('Velg PNG, JPEG, WebP eller GIF.');
  const bytes = Uint8Array.from(atob(args.base64), char => char.charCodeAt(0));
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('Velg et profilbilde under 5 MB.');
  return (await client.uploadContent(new Blob([bytes], { type: args.mimetype }), { type: args.mimetype, name: 'avatar' })).content_uri;
}
async function pollEvent(id: string, event: { type: string; content: object }) {
  await client.sendEvent(id, event.type, event.content); snapshot();
}
function pollData(room: any, event: any) {
  const id = event.getId();
  let entry = polls.get(id);
  if (!entry) {
    try {
      const model = room.polls?.get(id) || new Poll(event, client, room);
      entry = { model, responses: [], loading: true }; polls.set(id, entry);
      const update = () => {
        void model.getResponses().then((relations: any) => {
          if (polls.get(id) !== entry) return;
          entry!.responses = relations?.getRelations() || []; entry!.loading = false; entry!.error = undefined; scheduleSnapshot();
        }).catch(() => { if (polls.get(id) === entry) { entry!.error = 'Kunne ikke hente stemmene. Prøv igjen.'; entry!.loading = false; scheduleSnapshot(); } });
      };
      model.on(PollEvent.Responses, update); model.on(PollEvent.End, update); update();
    } catch { return { question: 'Avstemningen kunne ikke leses.', answers: [], ended: true, maxSelections: 1, myVote: [], total: 0, showResults: false }; }
  }
  const { model, responses } = entry;
  const answers = model.pollEvent.answers;
  const latest = new Map<string, any>();
  for (const response of responses) {
    if (response.isRedacted() || response.isDecryptionFailure() || response.status === 'not_sent') continue;
    const sender = response.getSender();
    if (sender && (!latest.has(sender) || latest.get(sender).getTs() <= response.getTs())) latest.set(sender, response);
  }
  const votes = [...latest.entries()].flatMap(([sender, response]) => {
    const content = response.getContent();
    const ids = (content['m.poll.response'] || content['org.matrix.msc3381.poll.response'])?.answers;
    return Array.isArray(ids) && ids.length <= model.pollEvent.maxSelections && new Set(ids).size === ids.length && ids.every(id => answers.some((answer: any) => answer.id === id)) ? [{ sender, ids }] : [];
  });
  const showResults = model.isEnded || M_POLL_KIND_DISCLOSED.matches(model.pollEvent.rawKind);
  return { question: model.pollEvent.question.text, maxSelections: model.pollEvent.maxSelections, ended: model.isEnded,
    answers: answers.map((answer: any) => ({ id: answer.id, text: answer.text, count: showResults ? votes.filter(vote => vote.ids.includes(answer.id)).length : 0 })),
    myVote: votes.find(vote => vote.sender === session.userId)?.ids || [], total: showResults ? votes.length : 0,
    showResults, loading: entry.loading, error: entry.error, canEnd: event.getSender() === session.userId };
}
function htmlSource(content: any): string {
  if (typeof content['org.gnomguttan.markdown'] === 'string') return content['org.gnomguttan.markdown'];
  if (content.format !== 'org.matrix.custom.html' || !content.formatted_body) return content.body || '';
  const document = new DOMParser().parseFromString(content.formatted_body, 'text/html');
  const walk = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent || '';
    if (!(node instanceof Element)) return '';
    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'iframe', 'img'].includes(tag)) return '';
    const text = Array.from(node.childNodes).map(walk).join('');
    if (['b', 'strong'].includes(tag)) return `**${text}**`;
    if (['em', 'i'].includes(tag)) return `*${text}*`;
    if (['del', 's'].includes(tag)) return `~~${text}~~`;
    if (tag === 'pre') return `\n\n\`\`\`\n${node.textContent}\n\`\`\`\n\n`;
    if (tag === 'code') return `\`${text}\``;
    if (tag === 'blockquote') return `\n${text.trim().split('\n').map(line => `> ${line}`).join('\n')}\n`;
    if (tag === 'li') return `\n- ${text.trim()}`;
    if (/^h[1-6]$/.test(tag)) return `\n${'#'.repeat(Number(tag[1]))} ${text}\n`;
    if (tag === 'a') { const href = node.getAttribute('href') || ''; return /^(https?:|mailto:|matrix:)/i.test(href) ? `[${text}](${href.replace(/\)/g, '%29')})` : text; }
    return tag === 'br' ? '\n' : ['p', 'div', 'ul', 'ol'].includes(tag) ? `\n${text}\n` : text;
  };
  return Array.from(document.body.childNodes).map(walk).join('').trim();
}
function showSas(value: any) { sas = value; verificationState(); }
function verificationState() {
  if (!verification) return;
  if ([VerificationPhase.Done, VerificationPhase.Cancelled].includes(verification.phase)) sas = null;
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
  const allReactions = [...new Map([...timeline, ...[...reactionCache.values()].flat()].map((event: any) => [event.getId(), event])).values()];
  const reactions = new Map<string, Map<string, any[]>>();
  for (const event of allReactions) {
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
  return timeline.filter((event: any) => isDisplayMessage(event.getType()) &&
    event.getContent()['m.relates_to']?.rel_type !== 'm.replace').map((event: any) => {
    const content = edits.get(event.getId()) || event.getContent();
    const sticker = event.getType() === 'm.sticker' || !!content['org.gnomguttan.sticker'];
    const poll = ['m.poll.start', 'org.matrix.msc3381.poll.start'].includes(event.getType());
    const location = parseGeoUri(content.geo_uri || content['m.location']?.uri || content['org.matrix.msc3488.location']?.uri || content.body);
    return {
      id: event.getId(), sender: event.getSender(), senderName: room.getMember(event.getSender())?.name || event.getSender(),
      avatar: room.getMember(event.getSender())?.events?.member?.getContent()?.avatar_url,
      body: event.isRedacted() ? 'Meldingen er slettet' : event.getType() === 'm.room.encrypted' ? 'Kryptert melding – venter på nøkkel' : htmlSource(content),
      timestamp: event.getTs(), msgtype: sticker ? 'm.image' : content.msgtype || 'm.text', encrypted: event.isEncrypted(), redacted: event.isRedacted(),
      sticker, edited: edits.has(event.getId()), replyTo: content['m.relates_to']?.['m.in_reply_to']?.event_id,
      ...(poll && !event.isRedacted() ? { poll: pollData(room, event) } : {}), ...(location && !event.isRedacted() ? { location } : {}),
      pending: ['sending', 'queued', 'encrypting'].includes(event.status), failed: event.status === 'not_sent',
      ...(content.url || content.file ? { media: { url: content.url, file: content.file, mimetype: content.info?.mimetype, name: content.body || 'Vedlegg' } } : {}),
      reactions: [...(reactions.get(event.getId()) || new Map()).entries()].map(([key, events]: any) => ({
        key, count: new Set(events.map((reaction: any) => reaction.getSender())).size, mine: events.some((reaction: any) => reaction.getSender() === session?.userId),
        names: [...new Set(events.map((reaction: any) => room.getMember(reaction.getSender())?.name || reaction.getSender()))],
        eventIds: events.filter((reaction: any) => reaction.getSender() === session?.userId).map((reaction: any) => reaction.getId()),
      })),
      readBy: room.getUsersReadUpTo(event).filter((id: string) => id !== session?.userId).map((id: string) => room.getMember(id)?.name || id),
    };
  });
}
function snapshot() {
  if (!client) return;
  const directs = new Set(Object.values(client.getAccountData(EventType.Direct)?.getContent() || {}).flat());
  const rooms = client.getRooms().filter((room: any) => ['join', 'invite'].includes(room.getMyMembership()))
    .map((room: any) => {
      const last = room.getLiveTimeline().getEvents().filter((event: any) => event.getType() === 'm.room.message').at(-1);
      return { id: room.roomId, name: room.name, direct: directs.has(room.roomId), membership: room.getMyMembership(),
        unread: room.getUnreadNotificationCount(), encrypted: client.isRoomEncrypted(room.roomId),
        space: room.getType() === 'm.space', topic: room.currentState?.getStateEvents('m.room.topic', '')?.getContent()?.topic || '',
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
  reactionCache.clear();
  for (const entry of polls.values()) entry.model.removeAllListeners(); polls.clear();
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
  const relation = (event: any) => {
    const target = event.getRelation?.()?.event_id || event.getContent?.()?.['m.relates_to']?.event_id;
    if (target && polls.has(target)) polls.get(target)!.model.onNewRelation(event);
  };
  connection.on(RoomEvent.Timeline, relation); connection.on(MatrixEventEvent.Decrypted, relation);
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
  async logout() { ++generation; try { await client?.logout(); } finally { ++voiceGeneration; if (recorder?.state === 'recording') recorder.stop(); stopMicrophone(); voiceBlob = null; for (const entry of polls.values()) entry.model.removeAllListeners(); polls.clear(); reactionCache.clear(); pendingDMs.clear(); setVerification(null); client?.stopClient(); client?.removeAllListeners(); client = null; session = null; secretKey = null; roomId = ''; } },
  refresh() { snapshot(); },
  open({ id }) {
    roomId = id;
    const room = client?.getRoom(id);
    const readEventId = room?.getEventReadUpTo?.(session.userId, true) || null;
    const events = (room?.getLiveTimeline().getEvents() || []).filter((event: any) => isDisplayMessage(event.getType()) && !event.status && event.getContent()['m.relates_to']?.rel_type !== 'm.replace').map((event: any) => ({ id: event.getId(), sender: event.getSender() }));
    const firstUnread = firstUnreadId(events, readEventId, room?.getUnreadNotificationCount() || 0, session.userId);
    snapshot(); return { firstUnreadId: firstUnread, readEventId, hasMore: !!room?.getLiveTimeline().getPaginationToken?.('b') };
  },
  visibility({ active }) { visible = active; if (!active && recorder?.state === 'recording') recorder.stop(); },
  async history() { const room = client?.getRoom(roomId); if (room) await client.scrollback(room, 40); snapshot(); return { hasMore: !!room?.getLiveTimeline().getPaginationToken?.('b') }; },
  async send({ id, body, replyTo, editId }) {
    if (typeof body !== 'string' || !body.trim() || body.length > 20000) throw new Error('Skriv en melding på maks 20 000 tegn.');
    const content: any = markdownContent(body);
    if (replyTo) content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyTo } };
    if (editId) { content['m.new_content'] = { ...content }; content['m.relates_to'] = { rel_type: 'm.replace', event_id: editId }; content.body = `* ${body}`; }
    await client.sendMessage(id, content); snapshot();
  },
  async upload({ id, base64, name, mimetype, sticker = false, duration }) {
    const raw = Uint8Array.from(atob(base64), char => char.charCodeAt(0)).buffer;
    await uploadMatrixFile(client, id, new File([raw], name, { type: mimetype }), sticker, undefined, duration !== undefined ? { duration } : undefined); snapshot();
  },
  media,
  async read({ id, eventId }) {
    if (!visible || id !== roomId) return;
    const room = client?.getRoom(id); const event = room?.findEventById(eventId);
    if (event && !event.status && event.getType() !== 'm.room.encrypted' && !event.isDecryptionFailure?.()) { await client.sendReadReceipt(event); await client.setRoomReadMarkers(id, eventId); }
  },
  typing({ id, typing }) { return client?.sendTyping(id, typing, 5000); },
  async react({ id, eventId, key }) {
    if (typeof key !== 'string' || !key.trim() || key.length > 32) throw new Error('Velg en gyldig reaksjon.');
    const fetched: any[] = []; const tokens = new Set<string>(); let from: string | undefined;
    do {
      const result = await client.relations(id, eventId, 'm.annotation', 'm.reaction', { from });
      fetched.push(...result.events); from = result.nextBatch || undefined;
      if (from && tokens.has(from)) break; if (from) tokens.add(from);
    } while (from);
    const events = [...new Map([...fetched, ...(client.getRoom(id)?.getLiveTimeline().getEvents() || [])].map((event: any) => [event.getId(), event])).values()];
    const mine = events.filter((event: any) => event.getType() === 'm.reaction' && !event.isRedacted() && event.getSender() === session.userId &&
      event.getContent()['m.relates_to']?.event_id === eventId && event.getContent()['m.relates_to']?.key === key);
    if (mine.length) await Promise.all(mine.map((event: any) => client.redactEvent(id, event.getId())));
    else await client.sendEvent(id, 'm.reaction', { 'm.relates_to': { rel_type: 'm.annotation', event_id: eventId, key } });
    reactionCache.set(eventId, fetched.filter(event => !mine.includes(event))); snapshot();
  },
  async retry({ id, eventId }) { const room = client.getRoom(id); const event = room?.findEventById(eventId); if (!event) throw new Error('Meldingen finnes ikke.'); await client.resendEvent(event, room); snapshot(); },
  async remove({ id, eventId }) { await client.redactEvent(id, eventId); snapshot(); },
  async join({ id }) { await client.joinRoom(id); snapshot(); },
  async conversation({ target, encrypted = true }) {
    if (target.startsWith('@')) {
      if (!/^@[^:\s]+:[^\s]+$/.test(target) || target === session.userId) throw new Error('Velg en annen person med full Matrix-ID.');
      const directs = await client.getAccountDataFromServer(EventType.Direct) || {};
      const existing = (directs[target] || []).find((id: string) => client.getRoom(id)?.getMyMembership() === 'join');
      if (existing) return existing;
      const id = pendingDMs.get(target) || (await client.createRoom({ is_direct: true, invite: [target], preset: 'trusted_private_chat',
        ...(encrypted ? { initial_state: [{ type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }] } : {})
      })).room_id;
      pendingDMs.set(target, id);
      await client.setAccountDataRaw(EventType.Direct, { ...directs, [target]: [...new Set([...(directs[target] || []), id])] });
      pendingDMs.delete(target); snapshot(); return id;
    }
    if (!/^[!#][^:\s]+:[^\s]+$/.test(target)) throw new Error('Oppgi en romadresse eller Matrix-ID.');
    const joined = await client.joinRoom(target); snapshot(); return joined.roomId;
  },
  async leave({ id }) { await client.leave(id); snapshot(); },
  async createRoom({ name, topic = '', encrypted = true, space = false, publicRoom = false, alias }) {
    if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new Error('Gi rommet et navn på maks 200 tegn.');
    const result = await client.createRoom({ name: name.trim(), topic: topic.trim(), visibility: publicRoom ? 'public' : 'private', preset: publicRoom ? 'public_chat' : 'private_chat',
      ...(alias?.trim() ? { room_alias_name: alias.trim() } : {}), ...(space ? { creation_content: { type: 'm.space' } } : encrypted ? { initial_state: [{ type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }] } : {}) });
    snapshot(); return result.room_id;
  },
  directory({ query, since }) { return client.publicRooms({ limit: 30, since, filter: { generic_search_term: query || '' } }); },
  searchUsers({ term }) { return client.searchUserDirectory({ term, limit: 20 }); },
  async roomDetails({ id }) { const room = client.getRoom(id); if (!room) throw new Error('Rommet finnes ikke.'); await room.loadMembersIfNeeded(); return roomDetails(id); },
  async roomUpdate({ id, name, topic, joinRule, history, enableEncryption, avatar }) {
    const fields = [{ key: 'name', value: name, content: { name: name?.trim() } }, { key: 'topic', value: topic, content: { topic } },
      { key: 'join_rules', value: joinRule, content: { join_rule: joinRule } }, { key: 'history_visibility', value: history, content: { history_visibility: history } },
      { key: 'encryption', value: enableEncryption ? true : undefined, content: { algorithm: 'm.megolm.v1.aes-sha2' } },
      { key: 'avatar', value: avatar, content: null as any }].filter(item => item.value !== undefined);
    const details = roomDetails(id);
    if (fields.some(field => !details.permissions[field.key])) throw new Error('Du mangler tillatelse til å endre disse rominnstillingene.');
    if (name !== undefined && (!name.trim() || name.length > 200)) throw new Error('Oppgi et romnavn på maks 200 tegn.');
    if (joinRule !== undefined && !['public', 'invite'].includes(joinRule)) throw new Error('Ugyldig romtilgang.');
    if (history !== undefined && !['joined', 'invited', 'shared', 'world_readable'].includes(history)) throw new Error('Ugyldig historikktilgang.');
    for (const field of fields) await client.sendStateEvent(id, `m.room.${field.key}`, field.key === 'avatar' ? { url: await uploadAvatar(avatar) } : field.content, '');
    snapshot(); return roomDetails(id);
  },
  async mute({ id, muted }) { await client.setRoomMutePushRule('global', id, !!muted); return roomDetails(id); },
  async invite({ id, userId }) { if (!/^@[^:\s]+:[^\s]+$/.test(userId)) throw new Error('Oppgi en full Matrix-ID.'); await client.invite(id, userId); return roomDetails(id); },
  async spaceRooms({ id, from }) { return client.getRoomHierarchy(id, 50, 1, false, from); },
  async addSpaceRoom({ id, childId }) {
    const child = client.getRoom(childId);
    if (!child || !roomDetails(id).mayAddChild) throw new Error('Velg et rom du er medlem av, og et space du kan redigere.');
    const via = [...new Set([session.userId.split(':').slice(1).join(':'), childId.split(':').slice(1).join(':')])];
    await client.sendStateEvent(id, 'm.space.child', { via, suggested: true }, childId);
    if (child.currentState.maySendStateEvent('m.space.parent', session.userId)) await client.sendStateEvent(childId, 'm.space.parent', { via, canonical: false }, id);
  },
  profile,
  async saveProfile({ name, avatar }) {
    if (name !== undefined) { if (!name.trim() || name.length > 200) throw new Error('Oppgi et visningsnavn på maks 200 tegn.'); await client.setDisplayName(name.trim()); }
    if (avatar) await client.setAvatarUrl(await uploadAvatar(avatar));
    snapshot(); return profile();
  },
  async cryptoStatus() {
    const crypto = client.getCrypto();
    if (!crypto) throw new Error('Kryptering er ikke klar ennå.');
    const [device, crossSigning, secretStorage, backup] = await Promise.all([
      crypto.getDeviceVerificationStatus(session.userId, session.deviceId), crypto.isCrossSigningReady(), crypto.isSecretStorageReady(), crypto.getKeyBackupInfo(),
    ]);
    return { verified: device?.isVerified() === true, crossSigning, secretStorage, backup: !!backup, deviceId: session.deviceId };
  },
  async createPoll({ id, question, answers }) {
    if (!question?.trim() || question.length > 500 || !Array.isArray(answers) || answers.length < 2 || answers.length > 10 || answers.some(answer => typeof answer !== 'string' || !answer.trim() || answer.length > 200) || new Set(answers.map(answer => answer.trim())).size !== answers.length) throw new Error('Skriv et spørsmål og 2–10 forskjellige svaralternativer.');
    return pollEvent(id, PollStartEvent.from(question.trim(), answers.map(answer => answer.trim()), M_POLL_KIND_DISCLOSED, 1).serialize());
  },
  async votePoll({ id, eventId, answers }) {
    const room = client.getRoom(id); const event = room?.findEventById(eventId);
    if (!event) throw new Error('Last inn avstemningen før du stemmer.');
    const poll = pollData(room, event);
    if (poll.ended || !Array.isArray(answers) || answers.length > poll.maxSelections || new Set(answers).size !== answers.length || answers.some(answer => !poll.answers.some((option: any) => option.id === answer))) throw new Error('Avstemningen er avsluttet eller svaret er ugyldig.');
    return pollEvent(id, PollResponseEvent.from(answers, eventId).serialize());
  },
  async endPoll({ id, eventId }) {
    if (client.getRoom(id)?.findEventById(eventId)?.getSender() !== session.userId) throw new Error('Bare oppretteren kan avslutte avstemningen.');
    return pollEvent(id, PollEndEvent.from(eventId, 'Avstemningen er avsluttet.').serialize());
  },
  pollRefresh({ id, eventId }) { polls.get(eventId)?.model.removeAllListeners(); polls.delete(eventId); const event = client.getRoom(id)?.findEventById(eventId); if (event) pollData(client.getRoom(id), event); snapshot(); },
  locate() { return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Posisjon er ikke tilgjengelig på denne enheten.'));
    navigator.geolocation.getCurrentPosition(position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }),
      error => reject(new Error(error.code === 1 ? 'Gi GnomChat tilgang til posisjon i telefonens innstillinger.' : 'Kunne ikke finne posisjonen. Prøv igjen.')), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }); },
  async location({ id, latitude, longitude, accuracy }) {
    const uri = `geo:${latitude},${longitude}${accuracy === undefined ? '' : `;u=${accuracy}`}`;
    if (!parseGeoUri(uri)) throw new Error('Ugyldig posisjon.');
    await client.sendMessage(id, { ...makeLocationContent('Delt posisjon', uri, Date.now(), 'Min posisjon'), msgtype: 'm.location', info: {} }); snapshot();
  },
  async sticker({ id, emoji }) { if (typeof emoji !== 'string' || !emoji || emoji.length > 32) throw new Error('Velg en sticker.'); await uploadMatrixFile(client, id, await makeEmojiSticker(emoji), true); snapshot(); },
  async voiceStart() {
    if (recorder?.state === 'recording') throw new Error('Et opptak er allerede i gang.');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Telefonens WebView støtter ikke lydopptak. Oppdater WebView og gi mikrofontilgang.');
    microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
    const stream = microphone; const version = ++voiceGeneration;
    try {
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(value => MediaRecorder.isTypeSupported(value));
      recorder = new MediaRecorder(microphone, mime ? { mimeType: mime } : undefined); voiceBlob = null;
      const chunks: Blob[] = []; recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const current = recorder;
      recorder.onstop = () => { stream.getTracks().forEach(track => track.stop()); if (version !== voiceGeneration) return; voiceDuration = Date.now() - voiceStarted; voiceBlob = new Blob(chunks, { type: current.mimeType || mime || 'audio/webm' }); post({ type: 'voice-state', state: 'ready', duration: voiceDuration }); };
      recorder.start(); voiceStarted = Date.now();
      post({ type: 'voice-state', state: 'recording', duration: 0 });
    } catch (error) { stopMicrophone(); throw error; }
  },
  async voiceStop() {
    if (!recorder || recorder.state !== 'recording') throw new Error('Ingen lydmelding tas opp.');
    await new Promise<void>((resolve, reject) => { recorder!.addEventListener('stop', () => resolve(), { once: true }); recorder!.addEventListener('error', () => { stopMicrophone(); reject(new Error('Lydopptaket feilet.')); }, { once: true }); recorder!.stop(); });
    return { duration: voiceDuration, size: voiceBlob?.size };
  },
  async voiceSend({ id }) {
    if (!voiceBlob?.size) throw new Error('Ta opp en lydmelding først.');
    const extension = voiceBlob.type.includes('mp4') ? 'm4a' : voiceBlob.type.includes('ogg') ? 'ogg' : 'webm';
    await uploadMatrixFile(client, id, new File([voiceBlob], `lydmelding.${extension}`, { type: voiceBlob.type }), false, undefined, { duration: voiceDuration });
    voiceBlob = null; post({ type: 'voice-state', state: 'none', duration: 0 }); snapshot();
  },
  voicePreview() {
    if (!voiceBlob?.size) throw new Error('Ta opp en lydmelding først.');
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Kunne ikke forhåndsvise opptaket.')); reader.readAsDataURL(voiceBlob!); });
  },
  voiceCancel() { ++voiceGeneration; if (recorder?.state === 'recording') recorder.stop(); stopMicrophone(); voiceBlob = null; post({ type: 'voice-state', state: 'none', duration: 0 }); },
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
  async recover({ key, mode = 'key' }) {
    try {
      const keyId = await client.secretStorage.getDefaultKeyId();
      const metadata = keyId ? await client.secretStorage.getKey(keyId) : null;
      if (!metadata) throw new Error('Denne kontoen har ikke konfigurert nøkkellagring. Sett opp sikkerhetskopi fra en innlogget Matrix-klient først.');
      if (mode === 'passphrase') {
        if (!metadata[1].passphrase) throw new Error('Kontoen bruker en gjenopprettingsnøkkel, ikke et gjenopprettingspassord. Velg «Nøkkel».');
        const info = metadata[1].passphrase;
        if (info.algorithm !== 'm.pbkdf2' || typeof info.salt !== 'string' || !Number.isInteger(info.iterations) || info.iterations < 1) throw new Error('Denne typen gjenopprettingspassord støttes ikke. Bruk gjenopprettingsnøkkelen.');
        secretKey = await deriveRecoveryKeyFromPassphrase(key, info.salt, info.iterations, info.bits || 256);
      } else {
        const normalized = normalizeRecoveryKey(key);
        try { secretKey = decodeRecoveryKey(normalized); } catch { throw new Error('Gjenopprettingsnøkkelen er ufullstendig eller har en skrivefeil. Kopier hele nøkkelen fra Matrix-klientens sikkerhetsinnstillinger.'); }
      }
      if (!await client.secretStorage.checkKey(secretKey, metadata[1])) throw new Error(mode === 'passphrase' ? 'Gjenopprettingspassordet passer ikke til kontoen.' : 'Gjenopprettingsnøkkelen passer ikke til denne kontoen.');
      post({ type: 'crypto-progress', status: 'Låser opp sikkerhetskopien …' });
      const crypto = client.getCrypto();
      if (await crypto.userHasCrossSigningKeys()) await crypto.bootstrapCrossSigning({ setupNewCrossSigning: false });
      await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      const result = await crypto.restoreKeyBackup({ progressCallback: (progress: any) => post({ type: 'crypto-progress', status: progress.stage === 'load_keys' ? `Gjenoppretter nøkler: ${progress.successes || 0} av ${progress.total || 0}` : 'Henter krypterte meldingsnøkler …' }) });
      await Promise.all(client.getRooms().flatMap((room: any) => room.getLiveTimeline().getEvents()).filter((event: any) => event.isDecryptionFailure())
        .map((event: any) => client.decryptEventIfNeeded(event).catch(() => undefined)));
      snapshot(); return result.imported;
    } finally { secretKey = null; post({ type: 'crypto-progress', status: '' }); }
  },
};
(window as any).__gnomMatrixCommand = async ({ id, method, args }: any) => {
  try {
    if (!Object.hasOwn(commands, method)) throw new Error('Ukjent Matrix-operasjon.');
    const result = await commands[method](args || {}); post({ type: 'response', id, result: result ?? null });
  } catch (error: any) { post({ type: 'response', id, error: error.errcode === 'M_FORBIDDEN' ? method === 'login' ? 'Feil brukernavn eller passord.' : 'Du mangler tilgang til denne handlingen på Matrix-serveren.' : error.message || 'Matrix-operasjonen feilet.' }); }
};
window.addEventListener('unhandledrejection', event => post({ type: 'error', error: event.reason?.message || 'Matrix mistet forbindelsen.' }));
post({ type: 'ready' });
