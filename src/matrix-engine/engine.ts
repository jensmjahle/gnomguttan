// The Matrix engine behind GnomChat's native chat screens. See protocol.ts.
//
// It runs in a hidden WebView inside the app (and can be driven from a normal
// browser for testing via window.gnomEngine). It owns the matrix-js-sdk client,
// the Rust crypto store (IndexedDB) and the sync cache, and reports plain JSON
// snapshots of the room list and the room the app is looking at.
import {
  ClientEvent, Direction, EventType, IndexedDBStore, PendingEventOrdering, MatrixEventEvent, MsgType, Preset, RelationType, RoomEvent, RoomMemberEvent,
  RoomType, SyncState, Visibility, createClient, type MatrixClient, type MatrixEvent, type Room,
} from 'matrix-js-sdk';
import { CryptoEvent, VerificationPhase, VerificationRequestEvent, VerifierEvent, decodeRecoveryKey, type ShowSasCallbacks, type VerificationRequest, type Verifier } from 'matrix-js-sdk/lib/crypto-api';
import { Poll } from 'matrix-js-sdk/lib/models/poll';
import { PollStartEvent } from 'matrix-js-sdk/lib/extensible_events_v1/PollStartEvent';
import { PollResponseEvent } from 'matrix-js-sdk/lib/extensible_events_v1/PollResponseEvent';
import { PollEndEvent } from 'matrix-js-sdk/lib/extensible_events_v1/PollEndEvent';
import { M_POLL_KIND_DISCLOSED } from 'matrix-js-sdk/lib/@types/polls';
import type { TimelineEvents } from 'matrix-js-sdk/lib/@types/event';
import { makeLocationContent } from 'matrix-js-sdk/lib/content-helpers';
import { initAsync } from '@matrix-org/matrix-sdk-crypto-wasm';
import cryptoWasmUrl from '../../node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm?url';
import { decryptAttachment } from 'matrix-encrypt-attachment';
import { isDisplayMessage, makeEmojiSticker, uploadMatrixFile } from '@/services/matrixMedia';
import { displayedContent, markdownContent } from '@/services/matrixMarkdown';
import { parseGeoUri } from '@/services/matrixLocation';
import {
  ENGINE_PROTOCOL_VERSION, type EngineCommands, type EngineEvent, type EngineRequest, type EngineSession, type MediaRef,
  type PollView, type Reaction, type RoomDetails, type RoomSummary, type SyncStatus, type TimelineItem, type UserResult, type VerificationView,
} from './protocol';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
    gnomEngine?: { receive: (message: string | EngineRequest) => void; onEvent?: (event: EngineEvent) => void };
  }
}

const TIMELINE_LIMIT = 200;

// The app's web preview (gnomchat on react-native-web) embeds the engine in an iframe
// and talks over postMessage. Only allowed on a local dev machine.
const LOCAL_DEV = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const framed = LOCAL_DEV && window.parent !== window;

function emit(event: EngineEvent) {
  const text = JSON.stringify(event);
  window.ReactNativeWebView?.postMessage(text);
  if (framed && !window.ReactNativeWebView) window.parent.postMessage({ gnomEngine: text }, '*');
  window.gnomEngine?.onEvent?.(event);
}

function errorText(error: unknown): { error: string; errcode?: string } {
  const errcode = (error as { errcode?: string })?.errcode;
  if (errcode === 'M_FORBIDDEN') return { error: 'Feil brukernavn eller passord, eller manglende tilgang.', errcode };
  if (errcode === 'M_UNKNOWN_TOKEN') return { error: 'Matrix-økten er utløpt. Logg inn på nytt.', errcode };
  if (errcode === 'M_LIMIT_EXCEEDED') return { error: 'For mange forsøk. Vent litt og prøv igjen.', errcode };
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Ukjent feil.';
  return { error: message, errcode };
}

function debounce(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; fn(); }, ms);
  };
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

// ── State ─────────────────────────────────────────────────────────────────────

let client: MatrixClient | null = null;
let session: EngineSession | null = null;
let cryptoReady = false;
let status: SyncStatus = 'stopped';
let statusDetail = '';
let watchedRoomId: string | null = null;
let verification: { request: VerificationRequest | null; sas: ShowSasCallbacks | null; verifier?: Verifier; error?: string } = { request: null, sas: null };
let secretKey: Uint8Array<ArrayBuffer> | null = null;
const polls = new Map<string, { poll: Poll; responses: MatrixEvent[] }>();

function setStatus(next: SyncStatus, detail = '') {
  status = next; statusDetail = detail;
  emit({ event: 'status', status, detail: statusDetail, cryptoReady, userId: session?.userId });
}

function requireClient(): MatrixClient {
  if (!client) throw new Error('Matrix er ikke koblet til.');
  return client;
}

function requireRoom(roomId: string): Room {
  const room = requireClient().getRoom(roomId);
  if (!room) throw new Error('Fant ikke rommet.');
  return room;
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

function avatarRef(mxc: string | null | undefined): MediaRef | undefined {
  return mxc && mxc.startsWith('mxc://') ? { mxc } : undefined;
}

function directRoomIds(c: MatrixClient): Set<string> {
  return new Set(Object.values(c.getAccountData(EventType.Direct)?.getContent() || {}).flat() as string[]);
}

// DMs rarely have their own avatar: show the other person's. Their member event can be
// missing with lazy-loaded members, so fall back to a (cached) profile lookup.
const profileAvatars = new Map<string, string | null>();

function directAvatar(room: Room, c: MatrixClient): string | undefined {
  const other = room.guessDMUserId();
  if (!other || other === c.getUserId()) return room.getAvatarFallbackMember()?.getMxcAvatarUrl() || undefined;
  const fromMember = room.getMember(other)?.getMxcAvatarUrl();
  if (fromMember) return fromMember;
  if (!profileAvatars.has(other)) {
    profileAvatars.set(other, null);
    void c.getProfileInfo(other).then((info) => {
      if (info.avatar_url) { profileAvatars.set(other, info.avatar_url); scheduleRooms(); }
    }).catch(() => undefined);
  }
  return profileAvatars.get(other) || undefined;
}

function previewFor(room: Room, c: MatrixClient): string {
  if (room.getMyMembership() === 'invite') return 'Du er invitert';
  if (room.isSpaceRoom()) return 'Space · Rom og samtaler';
  const last = [...room.getLiveTimeline().getEvents()].reverse().find((event) => isDisplayMessage(event.getType()) && event.getRelation()?.rel_type !== RelationType.Replace);
  if (!last) return 'Start samtalen';
  const content = last.getContent()['m.new_content'] || last.getContent();
  const who = last.getSender() === c.getUserId() ? 'Du: ' : '';
  if (last.isRedacted()) return 'Melding slettet';
  if (last.getType() === EventType.RoomMessageEncrypted || last.isDecryptionFailure()) return 'Kryptert melding';
  if (parseGeoUri(content?.geo_uri || content?.body)) return `${who}Delt posisjon`;
  if (last.getType() === EventType.Sticker || content?.['org.gnomguttan.sticker']) return `${who}Sticker`;
  switch (content?.msgtype) {
    case MsgType.Image: return `${who}Bilde`;
    case MsgType.Video: return `${who}Video`;
    case MsgType.Audio: return `${who}Lydmelding`;
    case MsgType.File: return `${who}Fil`;
    default: break;
  }
  if (typeof content?.body === 'string') return `${who}${content.body.replace(/\s+/g, ' ').slice(0, 140)}`;
  return `${who}Avstemning`;
}

function roomSummaries(): RoomSummary[] {
  const c = client;
  if (!c) return [];
  const direct = directRoomIds(c);
  return c.getRooms()
    .filter((room) => ['join', 'invite'].includes(room.getMyMembership()))
    .sort((a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp())
    .map((room) => {
      const me = room.getMember(c.getUserId() || '');
      const inviter = room.getMyMembership() === 'invite' ? me?.events.member?.getSender() : undefined;
      const isDirect = direct.has(room.roomId) || Boolean(me?.getDMInviter());
      return {
        roomId: room.roomId,
        name: room.name || room.roomId,
        avatar: avatarRef(room.getMxcAvatarUrl() || (isDirect ? directAvatar(room, c) : undefined)),
        topic: room.currentState.getStateEvents(EventType.RoomTopic, '')?.getContent().topic || '',
        membership: room.getMyMembership(),
        inviter: inviter ? room.getMember(inviter)?.name || inviter : undefined,
        isSpace: room.isSpaceRoom(),
        isDirect,
        encrypted: Boolean(room.hasEncryptionStateEvent()),
        unread: room.getUnreadNotificationCount(),
        highlight: room.getUnreadNotificationCount('highlight' as never),
        lastTs: Math.max(0, room.getLastActiveTimestamp()),
        preview: previewFor(room, c),
        memberCount: room.getJoinedMemberCount(),
      };
    });
}

function reactionsFor(c: MatrixClient, room: Room, event: MatrixEvent, events: MatrixEvent[]): Reaction[] {
  const eventId = event.getId() || '';
  const aggregated = room.relations.getChildEventsForEvent(eventId, RelationType.Annotation, EventType.Reaction)?.getRelations() || [];
  const all = [...new Map([...aggregated, ...events.filter((item) => item.getType() === EventType.Reaction && item.getRelation()?.event_id === eventId)].map((item) => [item.getId(), item])).values()];
  const groups = new Map<string, Reaction>();
  for (const reaction of all) {
    if (reaction.isRedacted() || reaction.status === 'not_sent') continue;
    const key = reaction.getContent()['m.relates_to']?.key;
    if (typeof key !== 'string') continue;
    const group = groups.get(key) || { key, count: 0, mine: false, names: [] };
    const sender = reaction.getSender() || '';
    const name = room.getMember(sender)?.name || sender;
    if (!group.names.includes(name)) { group.count++; group.names.push(name); }
    group.mine ||= sender === c.getUserId();
    groups.set(key, group);
  }
  const summary = event.getUnsigned()['m.relations']?.['m.annotation']?.chunk as { key?: string; count?: number }[] | undefined;
  for (const item of summary || []) {
    if (!item.key || !item.count) continue;
    const group = groups.get(item.key) || { key: item.key, count: 0, mine: false, names: [] };
    group.count = Math.max(group.count, item.count);
    groups.set(item.key, group);
  }
  return [...groups.values()];
}

function pollFor(c: MatrixClient, room: Room, event: MatrixEvent): PollView | undefined {
  const id = event.getId();
  if (!id) return undefined;
  let entry = polls.get(id);
  if (!entry) {
    try {
      const poll = room.polls.get(id) || new Poll(event, c, room);
      entry = { poll, responses: [] };
      polls.set(id, entry);
      const current = entry;
      void poll.getResponses().then((relations) => { if (relations) { current.responses = [...relations.getRelations()]; scheduleTimeline(); } }).catch(() => undefined);
    } catch { return undefined; }
  }
  const { poll } = entry;
  const answers = poll.pollEvent.answers;
  const latest = new Map<string, MatrixEvent>();
  const responses = [...entry.responses, ...room.getLiveTimeline().getEvents().filter((item) => item.getRelation()?.event_id === id && ['m.poll.response', 'org.matrix.msc3381.poll.response'].includes(item.getType()))];
  for (const response of responses) {
    if (response.isRedacted() || response.isDecryptionFailure() || response.status === 'not_sent') continue;
    const sender = response.getSender();
    if (!sender) continue;
    if (!latest.has(sender) || latest.get(sender)!.getTs() <= response.getTs()) latest.set(sender, response);
  }
  const votes = [...latest.values()].flatMap((response) => {
    const content = response.getContent();
    const ids: unknown = (content['m.poll.response'] || content['org.matrix.msc3381.poll.response'])?.answers;
    if (!Array.isArray(ids) || ids.length > poll.pollEvent.maxSelections || new Set(ids).size !== ids.length || ids.some((answerId) => !answers.some((answer) => answer.id === answerId))) return [];
    return [{ sender: response.getSender(), ids: ids as string[] }];
  });
  const mine = votes.find((vote) => vote.sender === c.getUserId())?.ids || [];
  const ended = poll.isEnded || room.getLiveTimeline().getEvents().some((item) => item.getRelation()?.event_id === id && ['m.poll.end', 'org.matrix.msc3381.poll.end'].includes(item.getType()) && item.getSender() === event.getSender());
  return {
    question: poll.pollEvent.question.text,
    answers: answers.map((answer) => ({ id: answer.id, text: answer.text, count: votes.filter((vote) => vote.ids.includes(answer.id)).length, mine: mine.includes(answer.id) })),
    ended,
    disclosed: M_POLL_KIND_DISCLOSED.matches(poll.pollEvent.rawKind),
    maxSelections: poll.pollEvent.maxSelections,
    totalVotes: votes.length,
    canEnd: !ended && event.getSender() === c.getUserId(),
  };
}

function bodyOf(content: Record<string, unknown>): string {
  const markdown = content['org.gnomguttan.markdown'];
  if (typeof markdown === 'string') return markdown;
  const body = typeof content.body === 'string' ? content.body : '';
  // Strip the quoted fallback of a reply ("> <@a:b> text\n\nreply").
  return content['m.relates_to'] && (content['m.relates_to'] as { 'm.in_reply_to'?: unknown })['m.in_reply_to']
    ? body.replace(/^(>.*\n)+\n?/, '')
    : body;
}

function membershipText(event: MatrixEvent, name: string): string {
  const content = event.getContent();
  const previous = event.getPrevContent()?.membership;
  switch (content.membership) {
    case 'join': return previous === 'join' ? `${name} oppdaterte profilen sin` : `${name} ble med`;
    case 'leave': return event.getStateKey() === event.getSender() ? `${name} forlot rommet` : `${name} ble fjernet`;
    case 'invite': return `${name} ble invitert`;
    case 'ban': return `${name} ble utestengt`;
    default: return `${name} endret medlemskap`;
  }
}

function timelineItem(c: MatrixClient, room: Room, event: MatrixEvent, events: MatrixEvent[]): TimelineItem {
  const sender = event.getSender() || '';
  const member = room.getMember(sender);
  const own = sender === c.getUserId();
  const { content, edited } = displayedContent(event, events);
  const type = event.getType();
  const status: TimelineItem['status'] = event.status === 'not_sent' ? 'failed' : event.status ? 'sending' : 'sent';
  const base: TimelineItem = {
    id: event.getId() || event.getTxnId() || `${sender}-${event.getTs()}`,
    sender,
    senderName: member?.name || sender,
    senderAvatar: avatarRef(member?.getMxcAvatarUrl()),
    own,
    ts: event.getTs(),
    kind: 'unknown',
    body: '',
    edited,
    reactions: [],
    status,
    canEdit: false,
    canRedact: !event.isRedacted() && !event.status && (own || room.currentState.hasSufficientPowerLevelFor('redact', room.getMember(c.getUserId() || '')?.powerLevel ?? 0)),
  };

  if (type === EventType.RoomMember) return { ...base, kind: 'membership', body: membershipText(event, room.getMember(event.getStateKey() || '')?.name || event.getStateKey() || sender), canRedact: false };
  if (event.isRedacted()) return { ...base, kind: 'redacted', body: 'Meldingen er slettet.', canRedact: false };
  if (event.isDecryptionFailure() || type === EventType.RoomMessageEncrypted) return { ...base, kind: 'encrypted', body: 'Venter på dekrypteringsnøkkel.' };

  base.reactions = reactionsFor(c, room, event, events);
  const relates = content['m.relates_to'] || event.getContent()['m.relates_to'];
  const replyId = relates?.['m.in_reply_to']?.event_id;
  if (typeof replyId === 'string') {
    const original = room.findEventById(replyId);
    const originalContent = original?.getContent() || {};
    base.replyTo = {
      id: replyId,
      senderName: original ? room.getMember(original.getSender() || '')?.name || original.getSender() || '' : '',
      body: original ? (original.isRedacted() ? 'Meldingen er slettet.' : bodyOf(originalContent).slice(0, 200) || 'Vedlegg') : 'Melding',
    };
  }

  const location = parseGeoUri(content.geo_uri || content['m.location']?.uri || content['org.matrix.msc3488.location']?.uri || (content.msgtype === MsgType.Location ? content.body : undefined));
  if (location) return { ...base, kind: 'location', body: content.body || 'Delt posisjon', location };

  if (type === 'm.poll.start' || type === 'org.matrix.msc3381.poll.start') {
    const poll = pollFor(c, room, event);
    return { ...base, kind: 'poll', body: poll?.question || 'Avstemning', poll };
  }

  const sticker = type === EventType.Sticker || Boolean(content['org.gnomguttan.sticker']);
  const msgtype = content.msgtype as string | undefined;
  if (sticker || [MsgType.Image, MsgType.Video, MsgType.Audio, MsgType.File].includes(msgtype as MsgType)) {
    const info = content.info || {};
    const thumbnail = info.thumbnail_file ? { file: info.thumbnail_file, mimetype: info.thumbnail_info?.mimetype } : info.thumbnail_url ? { mxc: info.thumbnail_url, mimetype: info.thumbnail_info?.mimetype } : undefined;
    return {
      ...base,
      kind: sticker ? 'sticker' : msgtype === MsgType.Image ? 'image' : msgtype === MsgType.Video ? 'video' : msgtype === MsgType.Audio ? 'audio' : 'file',
      body: content.body || '',
      media: {
        mxc: content.url, file: content.file, mimetype: info.mimetype,
        name: content.filename || content.body || 'Vedlegg', size: info.size, w: info.w, h: info.h,
        duration: info.duration ?? content['org.matrix.msc1767.audio']?.duration,
        thumbnail, voice: Boolean(content['org.matrix.msc3245.voice']),
      },
    };
  }

  const kind: TimelineItem['kind'] = msgtype === MsgType.Notice ? 'notice' : msgtype === MsgType.Emote ? 'emote' : 'text';
  return {
    ...base,
    kind,
    body: bodyOf(content) || 'Denne meldingstypen kan ikke vises.',
    canEdit: own && !event.status && msgtype === MsgType.Text,
  };
}

function timelineFor(roomId: string) {
  const c = client;
  const room = c?.getRoom(roomId);
  if (!c || !room) return null;
  const events = room.getLiveTimeline().getEvents();
  const shown = events.filter((event) => (isDisplayMessage(event.getType()) || event.getType() === EventType.RoomMember) && event.getRelation()?.rel_type !== RelationType.Replace).slice(-TIMELINE_LIMIT);
  // Pending (local echo) events are kept apart from the live timeline.
  const pending = room.getPendingEvents?.().filter((event) => isDisplayMessage(event.getType())) ?? [];
  const items = [...shown, ...pending].map((event) => timelineItem(c, room, event, events));
  const typing = room.getMembers().filter((member) => member.typing && member.userId !== c.getUserId()).map((member) => member.name);
  return { roomId, items, canPaginate: Boolean(room.getLiveTimeline().getPaginationToken(Direction.Backward)), typing };
}

const scheduleRooms = debounce(() => emit({ event: 'rooms', rooms: roomSummaries() }), 150);
const scheduleTimeline = debounce(() => {
  if (!watchedRoomId) return;
  const timeline = timelineFor(watchedRoomId);
  if (timeline) emit({ event: 'timeline', timeline });
}, 80);

function onAnyChange(event?: MatrixEvent | Room) {
  scheduleRooms();
  const roomId = event && 'getRoomId' in event ? event.getRoomId() : event && 'roomId' in event ? event.roomId : undefined;
  if (!roomId || roomId === watchedRoomId) scheduleTimeline();
}

// ── Verification ──────────────────────────────────────────────────────────────

function emitVerification() {
  const { request, sas, error } = verification;
  const phaseMap: Record<number, VerificationView['phase']> = {
    [VerificationPhase.Unsent]: 'requested',
    [VerificationPhase.Requested]: 'requested',
    [VerificationPhase.Ready]: 'ready',
    [VerificationPhase.Started]: 'started',
    [VerificationPhase.Cancelled]: 'cancelled',
    [VerificationPhase.Done]: 'done',
  };
  emit({
    event: 'verification',
    verification: {
      phase: request ? phaseMap[request.phase] ?? 'none' : 'none',
      initiatedByMe: Boolean(request?.initiatedByMe),
      otherDeviceId: request?.otherDeviceId || '',
      sas: sas ? { emoji: sas.sas.emoji, decimal: sas.sas.decimal } : undefined,
      error,
    },
  });
}

function attachVerification(request: VerificationRequest) {
  verification = { request, sas: null };
  const show = (value: ShowSasCallbacks) => { if (verification.request === request) { verification.sas = value; emitVerification(); } };
  const update = () => {
    if (verification.request !== request) return;
    if (request.phase === VerificationPhase.Done || request.phase === VerificationPhase.Cancelled) verification.sas = null;
    const verifier = request.verifier;
    if (verifier && verifier !== verification.verifier) {
      verification.verifier = verifier;
      verifier.on(VerifierEvent.ShowSas, show);
      const existing = verifier.getShowSasCallbacks();
      if (existing) show(existing);
      void verifier.verify().catch((reason) => { verification.error = errorText(reason).error; emitVerification(); });
    }
    emitVerification();
  };
  request.on(VerificationRequestEvent.Change, update);
  update();
}

// ── Client lifecycle ──────────────────────────────────────────────────────────

async function stopClient() {
  const c = client;
  client = null; cryptoReady = false; polls.clear(); profileAvatars.clear(); verification = { request: null, sas: null };
  if (c) { c.stopClient(); c.removeAllListeners(); }
  setStatus('stopped');
}

async function startClient(next: EngineSession) {
  if (client && session && session.userId === next.userId && session.deviceId === next.deviceId && session.accessToken === next.accessToken) return;
  await stopClient();
  session = next;
  setStatus('starting');
  const prefix = `gnomchat-matrix-${encodeURIComponent(`${next.baseUrl}|${next.userId}|${next.deviceId}`)}`;
  const store = new IndexedDBStore({ indexedDB: window.indexedDB, localStorage: window.localStorage, dbName: `${prefix}-sync` });
  const c = createClient({
    ...next,
    store,
    timelineSupport: true,
    verificationMethods: ['m.sas.v1'],
    cryptoCallbacks: {
      getSecretStorageKey: async ({ keys }) => {
        const keyId = await c.secretStorage.getDefaultKeyId();
        return keyId && keys[keyId] && secretKey ? [keyId, secretKey] : null;
      },
    },
  });
  client = c;
  c.on(ClientEvent.Sync, (state: SyncState, _previous: SyncState | null, data?: { error?: Error }) => {
    const code = (data?.error as { errcode?: string } | undefined)?.errcode;
    if (code === 'M_UNKNOWN_TOKEN') { emit({ event: 'sessionInvalid', reason: errorText(data?.error).error }); void stopClient(); return; }
    setStatus(state === SyncState.Prepared || state === SyncState.Syncing ? 'online' : state === SyncState.Error || state === SyncState.Reconnecting ? 'offline' : 'syncing');
    scheduleRooms(); scheduleTimeline();
  });
  c.on(ClientEvent.AccountData, () => scheduleRooms());
  c.on(RoomEvent.Timeline, (event) => onAnyChange(event));
  c.on(RoomEvent.Name, (room) => onAnyChange(room));
  c.on(RoomEvent.MyMembership, (room) => onAnyChange(room));
  c.on(RoomEvent.LocalEchoUpdated, (event) => onAnyChange(event));
  c.on(RoomEvent.Redaction, (event) => onAnyChange(event));
  c.on(RoomEvent.Receipt, (_event, room) => onAnyChange(room));
  c.on(MatrixEventEvent.Decrypted, (event) => onAnyChange(event));
  c.on(RoomMemberEvent.Typing, (_event, member) => { if (member.roomId === watchedRoomId) scheduleTimeline(); });
  c.on(CryptoEvent.VerificationRequestReceived, (request: VerificationRequest) => { if (request.isSelfVerification) attachVerification(request); });

  try {
    await store.startup();
    setStatus('crypto');
    await initAsync(cryptoWasmUrl);
    await c.initRustCrypto({ cryptoDatabasePrefix: prefix });
    cryptoReady = true;
    if (client !== c) return;
    setStatus('syncing');
    await c.startClient({ initialSyncLimit: 30, lazyLoadMembers: true, pendingEventOrdering: PendingEventOrdering.Detached });
  } catch (error) {
    if (client === c) setStatus('error', `Kunne ikke starte Matrix: ${errorText(error).error}`);
  }
}

// ── Commands ──────────────────────────────────────────────────────────────────

type Handler<K extends keyof EngineCommands> = (args: EngineCommands[K]['args']) => Promise<EngineCommands[K]['result']>;
type Handlers = { [K in keyof EngineCommands]: Handler<K> };

async function sendFile(roomId: string, base64: string, name: string, mimetype: string, sticker = false, voiceDuration?: number) {
  const c = requireClient();
  const file = new File([base64ToBytes(base64)], name, { type: mimetype });
  emit({ event: 'upload', roomId, progress: 0 });
  try {
    await uploadMatrixFile(c, roomId, file, sticker, (progress) => emit({ event: 'upload', roomId, progress }), voiceDuration !== undefined ? { duration: voiceDuration } : undefined);
  } finally {
    emit({ event: 'upload', roomId, progress: null });
  }
}

async function toggleReaction(roomId: string, eventId: string, key: string) {
  const c = requireClient();
  const room = requireRoom(roomId);
  const fetched: MatrixEvent[] = [];
  const tokens = new Set<string>();
  let from: string | undefined;
  do {
    const response = await c.relations(roomId, eventId, RelationType.Annotation, EventType.Reaction, { from });
    fetched.push(...response.events);
    from = response.nextBatch || undefined;
    if (from && tokens.has(from)) break;
    if (from) tokens.add(from);
  } while (from);
  const local = room.getLiveTimeline().getEvents().filter((item) => item.getType() === EventType.Reaction && item.getRelation()?.event_id === eventId);
  const existing = [...fetched, ...local].filter((item) => !item.isRedacted() && item.getSender() === c.getUserId() && item.getContent()['m.relates_to']?.key === key && item.getId());
  if (existing.length) await Promise.all([...new Set(existing.map((item) => item.getId()!))].map((id) => c.redactEvent(roomId, id)));
  else await c.sendEvent(roomId, EventType.Reaction, { 'm.relates_to': { event_id: eventId, key, rel_type: RelationType.Annotation } });
}

function sendPollEvent(c: MatrixClient, roomId: string, event: { type: string; content: object }) {
  return c.sendEvent(roomId, event.type as keyof TimelineEvents, event.content as never);
}

function power(room: Room, userId: string) {
  return (type: EventType) => room.currentState.maySendStateEvent(type, userId);
}

const handlers: Handlers = {
  async login({ baseUrl, user, password, deviceName }) {
    const url = new URL(baseUrl.includes('://') ? baseUrl.trim() : `https://${baseUrl.trim()}`);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname))) throw new Error('Bruk en HTTPS-adresse til Matrix-serveren.');
    const base = url.href.replace(/\/$/, '');
    const temp = createClient({ baseUrl: base });
    const flows = await temp.loginFlows();
    if (!flows.flows.some((flow) => flow.type === 'm.login.password')) throw new Error('Denne serveren støtter ikke passordinnlogging.');
    const result = await temp.login('m.login.password', { identifier: { type: 'm.id.user', user: user.trim() }, password, initial_device_display_name: deviceName });
    const next = { baseUrl: base, accessToken: result.access_token, userId: result.user_id, deviceId: result.device_id };
    void startClient(next);
    return next;
  },
  async start({ session: next }) { void startClient(next); return null; },
  async stop() { await stopClient(); return null; },
  async logout() {
    const c = client || (session ? createClient(session) : null);
    try { await c?.logout(true); } finally {
      await stopClient();
      session = null;
    }
    return null;
  },
  async watchRoom({ roomId }) {
    watchedRoomId = roomId;
    if (roomId) {
      const room = client?.getRoom(roomId);
      if (room) {
        void room.loadMembersIfNeeded().then(() => scheduleTimeline()).catch(() => undefined);
        const timeline = timelineFor(roomId);
        if (timeline) emit({ event: 'timeline', timeline });
      }
    }
    return null;
  },
  async paginate({ roomId }) {
    const room = requireRoom(roomId);
    await requireClient().scrollback(room, 40);
    scheduleTimeline();
    return { canPaginate: Boolean(room.getLiveTimeline().getPaginationToken(Direction.Backward)) };
  },
  async markRead({ roomId }) {
    const room = requireRoom(roomId);
    const events = room.getLiveTimeline().getEvents();
    const last = [...events].reverse().find((event) => event.getId() && !event.status);
    if (last) await requireClient().sendReadReceipt(last);
    scheduleRooms();
    return null;
  },
  async typing({ roomId, typing }) { await requireClient().sendTyping(roomId, typing, 6000).catch(() => undefined); return null; },
  async send({ roomId, text, replyTo }) {
    const content: Record<string, unknown> = markdownContent(text.trim());
    if (replyTo) content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyTo } };
    await requireClient().sendMessage(roomId, content as never);
    return null;
  },
  async edit({ roomId, eventId, text }) {
    const updated = markdownContent(text.trim());
    await requireClient().sendMessage(roomId, { ...updated, body: `* ${updated.body}`, 'm.new_content': updated, 'm.relates_to': { rel_type: RelationType.Replace, event_id: eventId } } as never);
    return null;
  },
  async redact({ roomId, eventId }) { await requireClient().redactEvent(roomId, eventId); return null; },
  async react({ roomId, eventId, key }) { await toggleReaction(roomId, eventId, key); return null; },
  async resend({ roomId, eventId }) {
    const room = requireRoom(roomId);
    const event = room.getPendingEvents().find((item) => item.getId() === eventId || item.getTxnId() === eventId) || room.findEventById(eventId);
    if (!event) throw new Error('Fant ikke meldingen.');
    await requireClient().resendEvent(event, room);
    return null;
  },
  async sendFile({ roomId, base64, name, mimetype, sticker, voiceDuration }) { await sendFile(roomId, base64, name, mimetype, sticker, voiceDuration); return null; },
  async sendEmojiSticker({ roomId, emoji }) {
    const file = await makeEmojiSticker(emoji);
    await uploadMatrixFile(requireClient(), roomId, file, true);
    return null;
  },
  async sendLocation({ roomId, latitude, longitude, accuracy }) {
    const uri = `geo:${latitude},${longitude}${accuracy !== undefined ? `;u=${accuracy}` : ''}`;
    await requireClient().sendMessage(roomId, { ...makeLocationContent('Delt posisjon', uri, Date.now(), 'Min posisjon'), msgtype: MsgType.Location, info: {} } as never);
    return null;
  },
  async createPoll({ roomId, question, answers }) {
    await sendPollEvent(requireClient(), roomId, PollStartEvent.from(question, answers, M_POLL_KIND_DISCLOSED, 1).serialize());
    return null;
  },
  async votePoll({ roomId, eventId, answerIds }) {
    await sendPollEvent(requireClient(), roomId, PollResponseEvent.from(answerIds, eventId).serialize());
    return null;
  },
  async endPoll({ roomId, eventId }) {
    await sendPollEvent(requireClient(), roomId, PollEndEvent.from(eventId, 'Avstemningen er avsluttet.').serialize());
    return null;
  },
  async media({ ref, thumbnail }) {
    const c = requireClient();
    const mxc = ref.file?.url || ref.mxc;
    if (!mxc?.startsWith('mxc://')) throw new Error('Ugyldig medieadresse.');
    const useThumb = thumbnail && !ref.file;
    const url = useThumb
      ? c.mxcUrlToHttp(mxc, thumbnail.width, thumbnail.height, 'scale', false, true, true)
      : c.mxcUrlToHttp(mxc, undefined, undefined, undefined, false, true, true);
    if (!url) throw new Error('Kunne ikke lese medieadressen.');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${c.getAccessToken()}` } });
    if (!response.ok) throw new Error(`Kunne ikke hente filen (${response.status}).`);
    const raw = await response.arrayBuffer();
    const data = ref.file ? new Uint8Array(await decryptAttachment(raw, ref.file as never)) : new Uint8Array(raw);
    return { base64: bytesToBase64(data), mimetype: ref.mimetype || response.headers.get('Content-Type') || 'application/octet-stream' };
  },
  async join({ target }) {
    const room = await requireClient().joinRoom(target.trim());
    scheduleRooms();
    return { roomId: room.roomId };
  },
  async leave({ roomId }) { await requireClient().leave(roomId); scheduleRooms(); return null; },
  async createRoom({ name, topic, encrypted, space, invite }) {
    const invitees = [...new Set((invite || []).map((id) => id.trim()).filter((id) => /^@[^:\s]+:[^\s]+$/.test(id)))];
    if (!name.trim() && !invitees.length) throw new Error('Gi rommet et navn.');
    const result = await requireClient().createRoom({
      name: name.trim() || undefined, topic: topic?.trim() || undefined, preset: Preset.PrivateChat, visibility: Visibility.Private,
      ...(invitees.length ? { invite: invitees } : {}),
      ...(space ? { creation_content: { type: RoomType.Space } } : encrypted ? { initial_state: [{ type: EventType.RoomEncryption, state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }] } : {}),
    });
    return { roomId: result.room_id };
  },
  async createDirect({ userId }) {
    const c = requireClient();
    if (!/^@[^:\s]+:[^\s]+$/.test(userId) || userId === c.getUserId()) throw new Error('Oppgi en Matrix-ID, for eksempel @gnomen:server.no.');
    const direct = (await c.getAccountDataFromServer(EventType.Direct)) || {};
    const existing = ((direct as Record<string, string[]>)[userId] || []).find((id) => c.getRoom(id)?.getMyMembership() === 'join');
    const roomId = existing || (await c.createRoom({ preset: Preset.TrustedPrivateChat, visibility: Visibility.Private, is_direct: true, invite: [userId], initial_state: [{ type: EventType.RoomEncryption, state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }] })).room_id;
    const list = (direct as Record<string, string[]>)[userId] || [];
    await c.setAccountDataRaw(EventType.Direct, { ...direct, [userId]: [...new Set([...list, roomId])] });
    return { roomId };
  },
  async searchUsers({ term, limit = 30 }) {
    const c = requireClient();
    const me = c.getUserId() || '';
    const q = term.trim().toLowerCase();
    const found = new Map<string, UserResult>();
    const add = (userId: string, name: string | undefined, mxc: string | null | undefined) => {
      if (!userId || userId === me) return;
      const known = found.get(userId);
      if (known) { if (!known.avatar && mxc) known.avatar = avatarRef(mxc); return; }
      found.set(userId, { userId, name: name || userId, avatar: avatarRef(mxc) });
    };
    const matches = (userId: string, name: string) => !q || name.toLowerCase().includes(q) || userId.toLowerCase().includes(q);
    // People you share a room with are known locally, even when the server's directory is strict.
    for (const room of c.getRooms()) {
      if (room.getMyMembership() !== 'join') continue;
      for (const member of room.getJoinedMembers()) if (matches(member.userId, member.name)) add(member.userId, member.name, member.getMxcAvatarUrl());
    }
    if (q) {
      const directory = await c.searchUserDirectory({ term: q, limit }).catch(() => null);
      directory?.results.forEach((user) => add(user.user_id, user.display_name, user.avatar_url));
      // An exact username («torbjorn» or «@torbjorn:server») finds anyone with an account.
      const local = q.replace(/^@/, '');
      if (/^[a-z0-9._=\-/+]+(:[^\s]+)?$/.test(local)) {
        const userId = local.includes(':') ? `@${local}` : `@${local}:${me.split(':').slice(1).join(':')}`;
        if (!found.has(userId) && userId !== me) {
          const info = await c.getProfileInfo(userId).catch(() => null);
          if (info) add(userId, info.displayname, info.avatar_url);
        }
      }
    }
    return [...found.values()]
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name, 'nb'))
      .slice(0, limit);
  },
  async invite({ roomId, userId }) {
    if (!/^@[^:\s]+:[^\s]+$/.test(userId.trim())) throw new Error('Oppgi en Matrix-ID, for eksempel @gnomen:server.no.');
    await requireClient().invite(roomId, userId.trim());
    return null;
  },
  async roomDetails({ roomId }) {
    const c = requireClient();
    const room = requireRoom(roomId);
    await room.loadMembersIfNeeded().catch(() => undefined);
    const may = power(room, c.getUserId()!);
    const details: RoomDetails = {
      roomId,
      name: room.name,
      topic: room.currentState.getStateEvents(EventType.RoomTopic, '')?.getContent().topic || '',
      alias: room.getCanonicalAlias() || '',
      avatar: avatarRef(room.getMxcAvatarUrl()),
      encrypted: Boolean(room.hasEncryptionStateEvent()),
      isSpace: room.isSpaceRoom(),
      joinRule: room.getJoinRule() || 'invite',
      historyVisibility: room.getHistoryVisibility() || 'shared',
      canEdit: {
        name: may(EventType.RoomName), topic: may(EventType.RoomTopic), avatar: may(EventType.RoomAvatar),
        joinRules: may(EventType.RoomJoinRules), history: may(EventType.RoomHistoryVisibility), encryption: may(EventType.RoomEncryption),
        spaceChild: may(EventType.SpaceChild),
      },
      canInvite: room.canInvite(c.getUserId()!),
      members: room.getMembers().filter((member) => ['join', 'invite'].includes(member.membership || '')).map((member) => ({
        userId: member.userId, name: member.name, avatar: avatarRef(member.getMxcAvatarUrl()), membership: member.membership || '', powerLevel: member.powerLevel,
      })),
    };
    return details;
  },
  async updateRoom({ roomId, name, topic, joinRule, historyVisibility }) {
    const c = requireClient();
    const room = requireRoom(roomId);
    if (name !== undefined && name.trim() && name.trim() !== room.name) await c.setRoomName(roomId, name.trim());
    if (topic !== undefined && topic !== (room.currentState.getStateEvents(EventType.RoomTopic, '')?.getContent().topic || '')) await c.setRoomTopic(roomId, topic);
    if (joinRule && joinRule !== room.getJoinRule()) await c.sendStateEvent(roomId, EventType.RoomJoinRules, { join_rule: joinRule } as never, '');
    if (historyVisibility && historyVisibility !== room.getHistoryVisibility()) await c.sendStateEvent(roomId, EventType.RoomHistoryVisibility, { history_visibility: historyVisibility } as never, '');
    return null;
  },
  async setRoomAvatar({ roomId, base64, mimetype }) {
    const c = requireClient();
    const upload = await c.uploadContent(new Blob([base64ToBytes(base64)], { type: mimetype }), { type: mimetype });
    await c.sendStateEvent(roomId, EventType.RoomAvatar, { url: upload.content_uri }, '');
    return null;
  },
  async enableEncryption({ roomId }) {
    await requireClient().sendStateEvent(roomId, EventType.RoomEncryption, { algorithm: 'm.megolm.v1.aes-sha2' } as never, '');
    return null;
  },
  async spaceChildren({ roomId }) {
    const c = requireClient();
    const children = [];
    let next: string | undefined;
    do {
      const result = await c.getRoomHierarchy(roomId, 50, 1, false, next);
      children.push(...result.rooms.filter((item) => item.room_id !== roomId));
      next = result.next_batch;
    } while (next && children.length < 200);
    return children.map((child) => ({
      roomId: child.room_id,
      name: child.name || child.canonical_alias || child.room_id,
      topic: child.topic || '',
      avatar: avatarRef(child.avatar_url),
      isSpace: child.room_type === RoomType.Space,
      joined: c.getRoom(child.room_id)?.getMyMembership() === 'join',
    }));
  },
  async addToSpace({ spaceId, roomId }) {
    const c = requireClient();
    const child = c.getRoom(roomId);
    if (!child) throw new Error('Velg et rom du er medlem av.');
    const via = [...new Set([c.getUserId()!.split(':').slice(1).join(':'), roomId.split(':').slice(1).join(':')].filter(Boolean))];
    await c.sendStateEvent(spaceId, EventType.SpaceChild, { via, suggested: true } as never, roomId);
    if (child.currentState.maySendStateEvent(EventType.SpaceParent, c.getUserId()!)) await c.sendStateEvent(roomId, EventType.SpaceParent, { via, canonical: false } as never, spaceId);
    return null;
  },
  async profile() {
    const c = requireClient();
    const userId = c.getUserId()!;
    const info = await c.getProfileInfo(userId).catch(() => ({ displayname: userId, avatar_url: undefined }));
    return { userId, name: info.displayname || userId, avatar: avatarRef(info.avatar_url), deviceId: c.getDeviceId() || '', baseUrl: c.getHomeserverUrl() };
  },
  async setDisplayName({ name }) { await requireClient().setDisplayName(name.trim()); return null; },
  async setAvatar({ base64, mimetype }) {
    const c = requireClient();
    const upload = await c.uploadContent(new Blob([base64ToBytes(base64)], { type: mimetype }), { type: mimetype });
    await c.setAvatarUrl(upload.content_uri);
    return null;
  },
  async setPusher({ pushkey, gatewayUrl, appId, deviceName }) {
    await requireClient().setPusher({
      kind: 'http', app_id: appId, pushkey, app_display_name: 'GnomChat', device_display_name: deviceName, lang: 'nb',
      profile_tag: '', data: { url: gatewayUrl }, append: false,
    } as never);
    return null;
  },
  async removePusher({ pushkey, appId }) {
    await requireClient().setPusher({ kind: null, app_id: appId, pushkey } as never);
    return null;
  },
  async restoreHistory({ recoveryKey }) {
    const c = requireClient();
    const crypto = c.getCrypto();
    if (!crypto) throw new Error('Krypteringen er ikke klar ennå.');
    try {
      if (recoveryKey.trim()) secretKey = decodeRecoveryKey(recoveryKey.trim());
      if (secretKey) {
        const keyId = await c.secretStorage.getDefaultKeyId();
        if (!keyId || !(await c.secretStorage.checkKey(secretKey, (await c.secretStorage.getKey(keyId))![1]))) throw new Error('Gjenopprettingsnøkkelen passer ikke til denne kontoen.');
        if (await crypto.userHasCrossSigningKeys()) await crypto.bootstrapCrossSigning({ setupNewCrossSigning: false });
        await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      }
      const result = await crypto.restoreKeyBackup();
      await Promise.all(c.getRooms().flatMap((room) => room.getLiveTimeline().getEvents())
        .filter((event) => event.isDecryptionFailure()).map((event) => c.decryptEventIfNeeded(event).catch(() => undefined)));
      scheduleRooms(); scheduleTimeline();
      return { imported: result.imported };
    } finally { secretKey = null; }
  },
  async verifyStart() {
    const crypto = requireClient().getCrypto();
    if (!crypto) throw new Error('Krypteringen er ikke klar ennå.');
    attachVerification(await crypto.requestOwnUserVerification());
    return null;
  },
  async verifyAccept() { await verification.request?.accept(); return null; },
  async verifySas() { await verification.request?.startVerification('m.sas.v1'); return null; },
  async verifyConfirm() { await verification.sas?.confirm(); return null; },
  async verifyMismatch() { verification.sas?.mismatch(); return null; },
  async verifyCancel() { await verification.request?.cancel(); verification = { request: null, sas: null }; emitVerification(); return null; },
};

async function receive(message: string | EngineRequest) {
  let request: EngineRequest;
  try { request = typeof message === 'string' ? JSON.parse(message) : message; } catch { return; }
  const handler = handlers[request.cmd] as Handler<typeof request.cmd> | undefined;
  if (!handler) { emit({ event: 'reply', id: request.id, ok: false, error: `Ukjent kommando: ${request.cmd}` }); return; }
  try {
    const result = await handler(request.args as never);
    emit({ event: 'reply', id: request.id, ok: true, result: result ?? null });
  } catch (error) {
    emit({ event: 'reply', id: request.id, ok: false, ...errorText(error) });
  }
}

window.gnomEngine = { ...(window.gnomEngine ?? {}), receive: (message) => { void receive(message); } };
if (framed) {
  window.addEventListener('message', (event) => {
    const data = event.data as { gnomEngineCommand?: string } | null;
    if (event.source === window.parent && typeof data?.gnomEngineCommand === 'string') void receive(data.gnomEngineCommand);
  });
}
emit({ event: 'ready', version: ENGINE_PROTOCOL_VERSION });
