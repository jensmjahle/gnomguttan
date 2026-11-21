import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { COLLECTIONS } from './mongo.js';
import { sanitizeFeedDocument } from './feed.js';
import { describeFeedItem } from './notifications.js';
import { sendBotDirectMessage } from './vocechatBot.js';

// Mirrors EMOJIS in src/components/feed/EmojiPicker.tsx. The whitelist also
// keeps reaction keys safe to use as Mongo field names.
export const COMMENT_REACTION_EMOJIS = [
  '👍', '👎', '❤️', '😂', '😮', '😢',
  '🎉', '🔥', '👀', '💯', '🙏', '😍',
  '🤔', '😎', '💀', '🤣', '😅', '👏',
  '🫡', '💪', '🤡', '🥳', '😤', '🫠',
];

const EVENT_FEED_TYPE = 'community_event_created';
const MAX_COMMENT_LENGTH = 2000;
const MAX_MENTIONS = 20;
const DM_SNIPPET_LENGTH = 140;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_DATA_URL_PREFIX = /^data:(image\/(?:jpeg|png|gif|webp));base64,/;
const TYPING_THROTTLE_MS = 2000;

/** Per-user limits that stop a stuck client (or a bored friend) from flooding threads and notifications. */
export const DEFAULT_RATE_LIMITS = Object.freeze({
  writes: { windowMs: 60_000, max: 30 }, // comments, replies and edits
  images: { windowMs: 10 * 60_000, max: 12 },
  reactions: { windowMs: 60_000, max: 60 },
});
const MUTE_LEVELS = ['all', 'mentions'];

/** Higher wins when a user is related to a thread in several ways. */
const BUMP_REASON_PRIORITY = { participant: 1, post_mention: 2, own_post: 3, reply: 4, mention: 5 };

/** Which notification a bump reason turns into; grouped types merge while unread. */
const NOTIFICATION_TYPE_FOR_REASON = { mention: 'mention', reply: 'reply', own_post: 'comment', participant: 'thread', post_mention: 'thread' };
const GROUPED_NOTIFICATION_TYPES = new Set(['comment', 'thread']);

class CommentError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Shape-check stored mentions: [{ uid, name }], unique by uid. */
export function normalizeCommentMentions(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const entry of value) {
    const uid = Number(entry?.uid);
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (!Number.isFinite(uid) || !name || seen.has(uid)) continue;
    seen.add(uid);
    result.push({ uid, name });
    if (result.length >= MAX_MENTIONS) break;
  }
  return result;
}

function normalizeMentionUids(value) {
  if (!Array.isArray(value)) return [];
  const uids = value
    .map((entry) => Number(typeof entry === 'object' && entry !== null ? entry.uid : entry))
    .filter((uid) => Number.isFinite(uid) && uid > 0);
  return [...new Set(uids)].slice(0, MAX_MENTIONS);
}

/** Keep only requested mentions of known users whose "@Name" actually appears in the text. */
export function filterMentions(text, rawMentions, knownUsers) {
  const requested = new Set(normalizeMentionUids(rawMentions));
  return knownUsers
    .filter((user) => requested.has(user.uid) && user.name && text.includes(`@${user.name}`))
    .slice(0, MAX_MENTIONS)
    .map((user) => ({ uid: user.uid, name: user.name }));
}

export async function resolveMentions(db, text, rawMentions) {
  const uids = normalizeMentionUids(rawMentions);
  if (!text || uids.length === 0) return [];
  const users = await db.collection(COLLECTIONS.users)
    .find({ uid: { $in: uids } })
    .project({ _id: 0, uid: 1, name: 1 })
    .toArray();
  return filterMentions(text, uids, users);
}

/**
 * Decide whose feed a new comment bumps, and why. Everyone related to the thread
 * is bumped except the actor; each user gets their most specific reason.
 */
export function computeBumpTargets({ actorUid, ownerUids = [], postMentionUids = [], comments = [], newMentionUids = [], parentAuthorUid }) {
  const targets = new Map();
  const add = (uid, reason) => {
    if (!Number.isFinite(uid) || uid <= 0 || uid === actorUid) return;
    const current = targets.get(uid);
    if (!current || BUMP_REASON_PRIORITY[reason] > BUMP_REASON_PRIORITY[current]) targets.set(uid, reason);
  };

  for (const comment of comments) {
    add(comment.author?.uid, 'participant');
    for (const mention of comment.mentions ?? []) add(mention.uid, 'participant');
    for (const reply of comment.replies ?? []) {
      add(reply.author?.uid, 'participant');
      for (const mention of reply.mentions ?? []) add(mention.uid, 'participant');
    }
  }
  for (const uid of postMentionUids) add(uid, 'post_mention');
  for (const uid of ownerUids) add(uid, 'own_post');
  if (parentAuthorUid !== undefined) add(parentAuthorUid, 'reply');
  for (const uid of newMentionUids) add(uid, 'mention');

  return targets;
}

/**
 * Legacy clients (the gnomchat app) save event comments by sending the whole
 * array, and drop fields they don't know about. Keep the server's copy of
 * existing comments and only accept poll votes from them. A comment missing
 * from the array is only removed if the caller wrote it (only authors may
 * delete); new comments are attributed to the caller.
 */
export function mergeLegacyComments(existingComments, incomingComments, author, now = Date.now()) {
  const incomingById = new Map();
  for (const incoming of Array.isArray(incomingComments) ? incomingComments : []) {
    const id = typeof incoming?.id === 'string' ? incoming.id.trim() : '';
    if (id && !incomingById.has(id)) incomingById.set(id, incoming);
  }

  const comments = [];
  for (const previous of existingComments) {
    const incoming = incomingById.get(previous.id);
    if (!incoming) {
      if (previous.author?.uid !== author.uid) comments.push(previous);
      // Removing your own comment that has replies leaves a placeholder, as in the app.
      else if ((previous.replies ?? []).length > 0) comments.push(toDeletedPlaceholder(previous, now));
      continue;
    }

    if (previous.poll && incoming.poll) {
      const incomingVotes = new Map((incoming.poll.options ?? []).map((option) => [option?.id, option?.votes]));
      comments.push({
        ...previous,
        poll: {
          ...previous.poll,
          options: previous.poll.options.map((option) => (
            Array.isArray(incomingVotes.get(option.id)) ? { ...option, votes: incomingVotes.get(option.id) } : option
          )),
        },
      });
    } else {
      comments.push(previous);
    }
  }

  const existingIds = new Set(existingComments.map((comment) => comment.id));
  for (const [id, incoming] of incomingById) {
    if (existingIds.has(id)) continue;
    const { replies: _replies, reactions: _reactions, mentions: _mentions, editedAt: _editedAt, imageId: _imageId, ...rest } = incoming;
    comments.push({ ...rest, id, author, createdAt: now });
  }

  return comments;
}

/** What's left of a comment deleted while it still has replies. */
export function toDeletedPlaceholder(comment, now = Date.now()) {
  return {
    id: comment.id,
    author: comment.author,
    createdAt: comment.createdAt,
    deleted: true,
    deletedAt: comment.deletedAt ?? now,
    text: '',
    replies: comment.replies ?? [],
  };
}

function readCommentText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > MAX_COMMENT_LENGTH) {
    throw new CommentError(400, `Kommentaren kan ikke være lengre enn ${MAX_COMMENT_LENGTH} tegn.`);
  }
  return text;
}

function truncate(text, length) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

/** Prefix every field path in a Mongo update document, e.g. text → comments.$[c].text */
function prefixUpdate(update, prefix) {
  return Object.fromEntries(Object.entries(update).map(([operator, fields]) => [
    operator,
    Object.fromEntries(Object.entries(fields).map(([path, value]) => [prefix + path, value])),
  ]));
}

/** Drop bump targets that muted the thread; level 'mentions' keeps only direct mentions. */
/** Fixed-window counter per key; enough for a single server process. */
export function createRateLimiter({ windowMs, max }) {
  const windows = new Map(); // key -> { start, count }
  return function allow(key, now = Date.now()) {
    const current = windows.get(key);
    if (!current || now - current.start >= windowMs) {
      windows.set(key, { start: now, count: 1 });
      if (windows.size > 1000) {
        for (const [entry, value] of windows) if (now - value.start >= windowMs) windows.delete(entry);
      }
      return true;
    }
    if (current.count >= max) return false;
    current.count += 1;
    return true;
  };
}

export function applyMutes(targets, mutesByUid) {
  return new Map([...targets].filter(([uid, reason]) => {
    const level = mutesByUid.get(uid);
    return !level || (level === 'mentions' && reason === 'mention');
  }));
}

/** The comment thread a feed item belongs to; event posts share the event's thread. */
export function feedItemThread(item) {
  return item.type === EVENT_FEED_TYPE && typeof item.payload?.id === 'string'
    ? { kind: 'event', id: item.payload.id }
    : { kind: 'feed', id: item.id };
}

function imageIdsOf(entry) {
  return [entry.imageId, ...(entry.replies ?? []).map((reply) => reply.imageId)].filter(Boolean);
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Comments live in threads: { kind: 'event', id: eventId } threads are stored
 * in community_events.comments[], { kind: 'feed', id: feedItemId } threads in
 * the feed_comments collection (one document per top-level comment). Both use
 * the same comment shape, so every operation is written once against a
 * per-thread write target.
 */
export function createCommentService({
  getDatabase,
  normalizeComment,
  normalizePerson,
  normalizePoll,
  sanitizeEventDocument,
  canUserViewCommunityEvent,
  queueMatrixEventChange,
  broadcastFeedEvent,
  sendFeedEventToUsers,
  notify = () => {},
  removeNotificationsForComments = async () => {},
  botApiKey,
  vocechatHost,
  publicUrl,
  rateLimits = DEFAULT_RATE_LIMITS,
}) {
  // `${uid}:${kind}:${id}` -> last broadcast, to throttle typing signals.
  const typingSentAt = new Map();
  const allowWrite = createRateLimiter(rateLimits.writes);
  const allowImage = createRateLimiter(rateLimits.images);
  const allowReaction = createRateLimiter(rateLimits.reactions);

  function requireAllowed(allow, user) {
    if (!allow(user.uid)) throw new CommentError(429, 'Du er litt for rask — vent et øyeblikk og prøv igjen.');
  }

  async function loadEvent(db, eventId) {
    const document = await db.collection(COLLECTIONS.events).findOne({ id: eventId });
    return document ? sanitizeEventDocument(document) : null;
  }

  async function resolveThread(db, kind, id, user) {
    if (kind === 'feed') {
      const feedItem = await db.collection(COLLECTIONS.feed).findOne({ id });
      if (!feedItem) throw new CommentError(404, 'Innlegget finnes ikke.');
      // Event posts share their thread with the event page.
      if (feedItem.type === EVENT_FEED_TYPE && typeof feedItem.payload?.id === 'string') {
        return resolveThread(db, 'event', feedItem.payload.id, user);
      }
      return { db, thread: { kind: 'feed', id }, feedItem };
    }

    if (kind === 'event') {
      const event = await loadEvent(db, id);
      if (!event || !canUserViewCommunityEvent(event, user)) throw new CommentError(404, 'Arrangementet finnes ikke.');
      if (event.status !== 'published') throw new CommentError(403, 'Arrangementet er ikke publisert.');
      return { db, thread: { kind: 'event', id }, event };
    }

    throw new CommentError(400, 'Ukjent kommentartråd.');
  }

  /** The feed posts showing this thread (an event can have been published more than once). */
  async function threadFeedItems(ctx) {
    if (ctx.thread.kind === 'feed') return [ctx.feedItem];
    return ctx.db.collection(COLLECTIONS.feed).find({ type: EVENT_FEED_TYPE, 'payload.id': ctx.thread.id }).toArray();
  }

  async function listThreadComments(ctx) {
    if (ctx.thread.kind === 'event') return ctx.event.comments;
    const documents = await ctx.db.collection(COLLECTIONS.feedComments)
      .find({ feedItemId: ctx.thread.id })
      .sort({ createdAt: 1 })
      .toArray();
    return documents.map(normalizeComment).filter(Boolean);
  }

  async function requireComment(ctx, commentId) {
    const comment = ctx.thread.kind === 'event'
      ? ctx.event.comments.find((entry) => entry.id === commentId)
      : normalizeComment(await ctx.db.collection(COLLECTIONS.feedComments).findOne({ id: commentId, feedItemId: ctx.thread.id }));
    if (!comment) throw new CommentError(404, 'Kommentaren finnes ikke.');
    return comment;
  }

  function requireReply(comment, replyId) {
    const reply = (comment.replies ?? []).find((entry) => entry.id === replyId);
    if (!reply) throw new CommentError(404, 'Svaret finnes ikke.');
    return reply;
  }

  function requireAuthor(entry, user, message) {
    if (entry.author?.uid !== user.uid) throw new CommentError(403, message);
  }

  /** Apply an update to one top-level comment (and optionally its replies via $[r]). */
  async function updateComment(ctx, commentId, update, extraArrayFilters = []) {
    if (ctx.thread.kind === 'event') {
      const prefixed = prefixUpdate(update, 'comments.$[c].');
      prefixed.$set = { ...prefixed.$set, updatedAt: Date.now() };
      await ctx.db.collection(COLLECTIONS.events).updateOne(
        { id: ctx.thread.id },
        prefixed,
        { arrayFilters: [{ 'c.id': commentId }, ...extraArrayFilters] },
      );
      return;
    }

    await ctx.db.collection(COLLECTIONS.feedComments).updateOne(
      { id: commentId, feedItemId: ctx.thread.id },
      update,
      extraArrayFilters.length > 0 ? { arrayFilters: extraArrayFilters } : {},
    );
  }

  /** Refresh the event after a write and keep the Matrix notices flowing. */
  async function commit(ctx, user) {
    if (ctx.thread.kind !== 'event') return;
    const previous = ctx.event;
    ctx.event = (await loadEvent(ctx.db, ctx.thread.id)) ?? previous;
    await queueMatrixEventChange(previous, ctx.event, user);
  }

  // ── Images ──────────────────────────────────────────────────────────────────

  /** Store an attached image (a data URL from the composer) and return its id. */
  async function storeCommentImage(db, dataUrl, uid) {
    const match = IMAGE_DATA_URL_PREFIX.exec(dataUrl);
    if (!match) throw new CommentError(400, 'Bildet må være JPEG, PNG, GIF eller WebP.');
    const data = Buffer.from(dataUrl.slice(match[0].length), 'base64');
    if (data.length === 0) throw new CommentError(400, 'Bildet er tomt.');
    if (data.length > MAX_IMAGE_BYTES) throw new CommentError(400, 'Bildet er for stort (maks 3 MB).');
    const result = await db.collection(COLLECTIONS.commentImages).insertOne({ data, mimeType: match[1], uid, createdAt: Date.now() });
    return result.insertedId.toString();
  }

  async function deleteCommentImages(db, imageIds) {
    const objectIds = imageIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    if (objectIds.length === 0) return;
    await db.collection(COLLECTIONS.commentImages).deleteMany({ _id: { $in: objectIds } }).catch((error) => {
      console.error('[Comments] Failed to delete comment images', error);
    });
  }

  /** Notifications and bumps that pointed at comments/replies which no longer exist. */
  async function cleanupDeleted(db, commentIds) {
    if (commentIds.length === 0) return;
    await Promise.all([
      removeNotificationsForComments(commentIds),
      db.collection(COLLECTIONS.feedBumps).deleteMany({ commentId: { $in: commentIds } }),
    ]);
  }

  /** Delete the uploaded images of a whole thread (used when an event is deleted). */
  async function deleteThreadImages(comments) {
    const db = await getDatabase();
    await deleteCommentImages(db, (comments ?? []).flatMap(imageIdsOf));
  }

  function requireNotDeleted(comment) {
    if (comment.deleted) throw new CommentError(409, 'Kommentaren er slettet.');
  }

  function readImageDataUrl(body) {
    return typeof body?.imageDataUrl === 'string' && body.imageDataUrl ? body.imageDataUrl : null;
  }

  // ── Notifications, mutes and bumps ──────────────────────────────────────────

  /** In-app path to a thread (and comment): the event page or the post's own page. */
  function threadPath(thread, commentId) {
    const anchor = commentId ? `#c-${commentId}` : '';
    return thread.kind === 'event'
      ? `/arrangementer/${encodeURIComponent(thread.id)}${anchor}`
      : `/innlegg/${encodeURIComponent(thread.id)}${anchor}`;
  }

  function threadLink(ctx, commentId) {
    return `${publicUrl}${threadPath(ctx.thread, commentId)}`;
  }

  /** Short «name» of what the thread is about, for notification text. */
  function threadContext(ctx) {
    return ctx.thread.kind === 'event' ? ctx.event?.title || 'arrangementet' : describeFeedItem(ctx.feedItem);
  }

  /** uid -> mute level for the users (among `uids`) who muted this thread. */
  async function muteLevels(db, thread, uids) {
    if (uids.length === 0) return new Map();
    const mutes = await db.collection(COLLECTIONS.feedMutes)
      .find({ threadKind: thread.kind, threadId: thread.id, uid: { $in: uids } })
      .toArray();
    return new Map(mutes.map((mute) => [mute.uid, mute.level]));
  }

  function notifyMentions(actor, uids, { context, snippet, link }) {
    if (!botApiKey) return;
    const message = `${actor.name} nevnte deg ${context}: «${truncate(snippet, DM_SNIPPET_LENGTH)}»\n${link}`;
    for (const uid of new Set(uids)) {
      if (uid === actor.uid) continue;
      void sendBotDirectMessage({ vocechatHost, botApiKey, userId: uid, message }).catch((error) => {
        console.error(`[Comments] Failed to send mention DM to uid ${uid}`, error);
      });
    }
  }

  /** Join reactions, (non-event) comments and the viewer's mute level onto sanitized feed items. */
  async function attachFeedExtras(db, items, uid) {
    const itemIds = items.map((item) => item.id);
    const commentItemIds = items.filter((item) => item.type !== EVENT_FEED_TYPE).map((item) => item.id);
    const threads = items.map(feedItemThread);
    const [reactions, commentDocuments, mutes] = await Promise.all([
      db.collection(COLLECTIONS.feedReactions)
        .find({ feedItemId: { $in: itemIds } })
        .project({ _id: 0, feedItemId: 1, emoji: 1, uid: 1, actorName: 1 })
        .toArray(),
      db.collection(COLLECTIONS.feedComments)
        .find({ feedItemId: { $in: commentItemIds } })
        .sort({ createdAt: 1 })
        .toArray(),
      uid === undefined
        ? []
        : db.collection(COLLECTIONS.feedMutes).find({ uid, threadId: { $in: threads.map((thread) => thread.id) } }).toArray(),
    ]);

    const reactionsByItem = {};
    for (const r of reactions) {
      (reactionsByItem[r.feedItemId] ??= []).push({ emoji: r.emoji, uid: r.uid, actorName: r.actorName });
    }
    const commentsByItem = {};
    for (const document of commentDocuments) {
      const comment = normalizeComment(document);
      if (comment) (commentsByItem[document.feedItemId] ??= []).push(comment);
    }
    const muteByThread = new Map(mutes.map((mute) => [`${mute.threadKind}:${mute.threadId}`, mute.level]));

    return items.map((item, index) => {
      const mute = muteByThread.get(`${threads[index].kind}:${threads[index].id}`);
      return {
        ...item,
        reactions: reactionsByItem[item.id] ?? [],
        ...(item.type !== EVENT_FEED_TYPE ? { comments: commentsByItem[item.id] ?? [] } : {}),
        ...(mute ? { mute } : {}),
      };
    });
  }

  async function writeBumps(db, feedItems, targets, { actor, commentId, mutesByUid }) {
    const now = Date.now();
    const bump = { bumpedAt: now, byUid: actor.uid, byName: actor.name, ...(commentId ? { commentId } : {}) };
    const operations = [];
    for (const item of feedItems) {
      for (const [uid, reason] of targets) {
        operations.push({
          updateOne: { filter: { uid, feedItemId: item.id }, update: { $set: { ...bump, reason } }, upsert: true },
        });
      }
    }
    await db.collection(COLLECTIONS.feedBumps).bulkWrite(operations, { ordered: false });

    const enriched = await attachFeedExtras(db, feedItems.map(sanitizeFeedDocument));
    for (const [uid, reason] of targets) {
      const mute = mutesByUid.get(uid);
      for (const item of enriched) {
        sendFeedEventToUsers([uid], {
          __type: 'feed_bump',
          item: {
            ...item,
            sortAt: now,
            bump: { at: now, reason, byUid: actor.uid, byName: actor.name, ...(commentId ? { commentId } : {}) },
            ...(mute ? { mute } : {}),
          },
        });
      }
    }
  }

  /**
   * Bump the thread's feed posts for everyone related to it, and DM newly
   * mentioned users, respecting each user's mute level. `onlyUids` limits the
   * bump (used when an edit adds mentions).
   */
  async function onCommentActivity(ctx, { actor, commentId, parentAuthorUid, newMentionUids = [], snippet = '', onlyUids }) {
    try {
      const { db, thread } = ctx;
      const feedItems = await threadFeedItems(ctx);
      const comments = await listThreadComments(ctx);
      const ownerUids = [
        ...feedItems.map((item) => item.actorUid),
        ...(ctx.event ? [ctx.event.createdBy?.uid, ...ctx.event.coOrganizers.map((person) => person.uid)] : []),
      ];
      const postMentionUids = feedItems.flatMap((item) => normalizeCommentMentions(item.payload?.mentions).map((mention) => mention.uid));

      let targets = computeBumpTargets({ actorUid: actor.uid, ownerUids, postMentionUids, comments, newMentionUids, parentAuthorUid });
      if (onlyUids) targets = new Map([...targets].filter(([uid]) => onlyUids.includes(uid)));

      const mutesByUid = await muteLevels(db, thread, [...new Set([...targets.keys(), ...newMentionUids])]);
      targets = applyMutes(targets, mutesByUid);

      if (targets.size > 0 && feedItems.length > 0) await writeBumps(db, feedItems, targets, { actor, commentId, mutesByUid });

      const recipientsByType = new Map();
      for (const [uid, reason] of targets) {
        const type = NOTIFICATION_TYPE_FOR_REASON[reason];
        if (!recipientsByType.has(type)) recipientsByType.set(type, []);
        recipientsByType.get(type).push(uid);
      }
      const context = threadContext({ ...ctx, feedItem: ctx.feedItem ?? feedItems[0] });
      for (const [type, recipients] of recipientsByType) {
        void notify({
          type,
          recipients,
          actor,
          subject: thread.kind === 'event' ? 'event' : 'post',
          target: { kind: thread.kind, id: thread.id, ...(commentId ? { commentId } : {}) },
          context,
          snippet,
          link: threadPath(thread, commentId),
          ...(GROUPED_NOTIFICATION_TYPES.has(type) ? { groupKey: `${type}:${thread.kind}:${thread.id}` } : {}),
        });
      }

      const dmUids = newMentionUids.filter((uid) => mutesByUid.get(uid) !== 'all');
      if (dmUids.length > 0) {
        const title = ctx.event?.title;
        notifyMentions(actor, dmUids, {
          context: title ? `i en kommentar på «${title}»` : 'i en kommentar',
          snippet,
          link: threadLink(ctx, commentId),
        });
      }
    } catch (error) {
      console.error('[Comments] Failed to process comment activity', error);
    }
  }

  /** The gnomchat app still PUTs whole comment arrays; mirror those changes to live clients. */
  async function syncLegacyEventComments(previousEvent, nextEvent, actor) {
    if (nextEvent?.status !== 'published') return;
    const thread = { kind: 'event', id: nextEvent.id };
    const before = new Map((previousEvent?.comments ?? []).map((comment) => [comment.id, comment]));
    const after = new Map(nextEvent.comments.map((comment) => [comment.id, comment]));
    const db = await getDatabase();

    for (const [commentId, comment] of before) {
      if (after.has(commentId)) continue;
      broadcastFeedEvent({ __type: 'comment_deleted', thread, commentId });
      await deleteCommentImages(db, imageIdsOf(comment));
      await cleanupDeleted(db, [commentId, ...(comment.replies ?? []).map((reply) => reply.id)]);
    }

    const ctx = { db, thread, event: nextEvent };
    for (const [commentId, comment] of after) {
      const previous = before.get(commentId);
      if (!previous) {
        broadcastFeedEvent({ __type: 'comment_added', thread, comment });
        await onCommentActivity(ctx, { actor, commentId, snippet: comment.text ?? '' });
      } else if (comment.deleted && !previous.deleted) {
        broadcastFeedEvent({ __type: 'comment_updated', thread, commentId, patch: { deleted: true, deletedAt: comment.deletedAt } });
        await deleteCommentImages(db, [previous.imageId].filter(Boolean));
        await cleanupDeleted(db, [commentId]);
      } else if (JSON.stringify(previous.poll) !== JSON.stringify(comment.poll)) {
        broadcastFeedEvent({ __type: 'comment_updated', thread, commentId, patch: { poll: comment.poll } });
      }
    }
  }

  // ── Route handlers ──────────────────────────────────────────────────────────

  function route(handler) {
    return async (req, res) => {
      try {
        const db = await getDatabase();
        const ctx = await resolveThread(db, req.params.kind, req.params.id, req.currentUser);
        const { status = 200, body } = await handler(ctx, req, req.currentUser);
        if (body === undefined) res.status(status).end();
        else res.status(status).json(body);
      } catch (error) {
        if (error instanceof CommentError) {
          res.status(error.status).json({ error: error.message });
          return;
        }
        console.error('[Comments] Request failed', error);
        res.status(500).json({ error: 'Kunne ikke lagre kommentaren.' });
      }
    };
  }

  async function addComment(ctx, req, user) {
    requireAllowed(allowWrite, user);
    const isEvent = ctx.thread.kind === 'event';
    const now = Date.now();
    const author = normalizePerson(user, user.name);
    const text = readCommentText(req.body?.text);
    const imageDataUrl = readImageDataUrl(req.body);
    let poll = null;

    if (isEvent && req.body?.poll) {
      const options = (Array.isArray(req.body.poll.options) ? req.body.poll.options : [])
        .map((option) => ({ id: randomUUID(), label: option?.label, imageUrl: option?.imageUrl, votes: [] }));
      poll = normalizePoll({ ...req.body.poll, id: randomUUID(), options, createdAt: now, createdBy: author }, author, now);
      if (!poll || poll.options.length < 2) throw new CommentError(400, 'En avstemning må ha minst to alternativer.');
    }

    if (!text && !imageDataUrl && !poll) throw new CommentError(400, 'Kommentaren er tom.');
    if (imageDataUrl) requireAllowed(allowImage, user);

    const mentions = await resolveMentions(ctx.db, text, req.body?.mentions);
    const imageId = imageDataUrl ? await storeCommentImage(ctx.db, imageDataUrl, user.uid) : null;
    const comment = {
      id: randomUUID(),
      author,
      createdAt: now,
      ...(text ? { text } : {}),
      ...(mentions.length > 0 ? { mentions } : {}),
      ...(imageId ? { imageId } : {}),
      ...(poll ? { poll } : {}),
    };

    try {
      if (isEvent) {
        await ctx.db.collection(COLLECTIONS.events).updateOne(
          { id: ctx.thread.id },
          { $push: { comments: comment }, $set: { updatedAt: now } },
        );
      } else {
        await ctx.db.collection(COLLECTIONS.feedComments).insertOne({ ...comment, feedItemId: ctx.thread.id });
      }
    } catch (error) {
      if (imageId) await deleteCommentImages(ctx.db, [imageId]);
      throw error;
    }

    await commit(ctx, user);
    broadcastFeedEvent({ __type: 'comment_added', thread: ctx.thread, comment });
    void onCommentActivity(ctx, { actor: user, commentId: comment.id, newMentionUids: mentions.map((m) => m.uid), snippet: text });
    return { status: 201, body: comment };
  }

  async function editComment(ctx, req, user) {
    requireAllowed(allowWrite, user);
    const { commentId } = req.params;
    const existing = await requireComment(ctx, commentId);
    requireAuthor(existing, user, 'Du kan bare redigere dine egne kommentarer.');
    requireNotDeleted(existing);

    const text = readCommentText(req.body?.text);
    if (!text && !existing.imageUrl && !existing.imageId && !existing.poll) throw new CommentError(400, 'Kommentaren er tom.');

    const mentions = await resolveMentions(ctx.db, text, req.body?.mentions);
    const patch = { text, mentions, editedAt: Date.now() };
    await updateComment(ctx, commentId, { $set: patch });
    await commit(ctx, user);
    broadcastFeedEvent({ __type: 'comment_updated', thread: ctx.thread, commentId, patch });

    const addedMentionUids = mentions
      .filter((mention) => !(existing.mentions ?? []).some((previous) => previous.uid === mention.uid))
      .map((mention) => mention.uid);
    if (addedMentionUids.length > 0) {
      void onCommentActivity(ctx, { actor: user, commentId, newMentionUids: addedMentionUids, snippet: text, onlyUids: addedMentionUids });
    }
    return { body: { ...existing, ...patch } };
  }

  async function deleteComment(ctx, req, user) {
    const { commentId } = req.params;
    const existing = await requireComment(ctx, commentId);
    requireAuthor(existing, user, 'Du kan bare slette dine egne kommentarer.');
    requireNotDeleted(existing);

    // Other people's replies survive: the comment becomes a "Kommentaren er slettet" placeholder.
    if ((existing.replies ?? []).length > 0) {
      const { id: _id, author: _author, createdAt: _createdAt, replies: _replies, ...placeholder } = toDeletedPlaceholder(existing);
      await updateComment(ctx, commentId, {
        $set: { ...placeholder, mentions: [], reactions: {} },
        $unset: { imageId: '', imageUrl: '', poll: '', editedAt: '' },
      });
      await commit(ctx, user);
      await deleteCommentImages(ctx.db, [existing.imageId].filter(Boolean));
      await cleanupDeleted(ctx.db, [commentId]);
      broadcastFeedEvent({
        __type: 'comment_updated',
        thread: ctx.thread,
        commentId,
        patch: { deleted: true, deletedAt: placeholder.deletedAt },
      });
      // Tell the caller it became a placeholder, so their own view keeps the replies.
      return { body: { deleted: true, deletedAt: placeholder.deletedAt } };
    }

    await removeTopLevelComment(ctx, commentId);
    await commit(ctx, user);
    await deleteCommentImages(ctx.db, imageIdsOf(existing));
    await cleanupDeleted(ctx.db, [commentId]);
    broadcastFeedEvent({ __type: 'comment_deleted', thread: ctx.thread, commentId });
    return { status: 204 };
  }

  async function removeTopLevelComment(ctx, commentId) {
    if (ctx.thread.kind === 'event') {
      await ctx.db.collection(COLLECTIONS.events).updateOne(
        { id: ctx.thread.id },
        { $pull: { comments: { id: commentId } }, $set: { updatedAt: Date.now() } },
      );
    } else {
      await ctx.db.collection(COLLECTIONS.feedComments).deleteOne({ id: commentId, feedItemId: ctx.thread.id });
    }
  }

  async function addReply(ctx, req, user) {
    requireAllowed(allowWrite, user);
    const { commentId } = req.params;
    const parent = await requireComment(ctx, commentId);
    const text = readCommentText(req.body?.text);
    const imageDataUrl = readImageDataUrl(req.body);
    if (!text && !imageDataUrl) throw new CommentError(400, 'Svaret er tomt.');
    if (imageDataUrl) requireAllowed(allowImage, user);

    const mentions = await resolveMentions(ctx.db, text, req.body?.mentions);
    const imageId = imageDataUrl ? await storeCommentImage(ctx.db, imageDataUrl, user.uid) : null;
    const reply = {
      id: randomUUID(),
      author: normalizePerson(user, user.name),
      text,
      createdAt: Date.now(),
      ...(mentions.length > 0 ? { mentions } : {}),
      ...(imageId ? { imageId } : {}),
    };

    try {
      await updateComment(ctx, commentId, { $push: { replies: reply } });
    } catch (error) {
      if (imageId) await deleteCommentImages(ctx.db, [imageId]);
      throw error;
    }
    await commit(ctx, user);
    broadcastFeedEvent({ __type: 'reply_added', thread: ctx.thread, commentId, reply });
    void onCommentActivity(ctx, {
      actor: user,
      commentId: reply.id,
      parentAuthorUid: parent.author.uid,
      newMentionUids: mentions.map((m) => m.uid),
      snippet: text,
    });
    return { status: 201, body: reply };
  }

  async function editReply(ctx, req, user) {
    requireAllowed(allowWrite, user);
    const { commentId, replyId } = req.params;
    const existing = requireReply(await requireComment(ctx, commentId), replyId);
    requireAuthor(existing, user, 'Du kan bare redigere dine egne svar.');

    const text = readCommentText(req.body?.text);
    if (!text && !existing.imageId) throw new CommentError(400, 'Svaret er tomt.');

    const mentions = await resolveMentions(ctx.db, text, req.body?.mentions);
    const patch = { text, mentions, editedAt: Date.now() };
    await updateComment(
      ctx,
      commentId,
      { $set: { 'replies.$[r].text': text, 'replies.$[r].mentions': mentions, 'replies.$[r].editedAt': patch.editedAt } },
      [{ 'r.id': replyId }],
    );
    await commit(ctx, user);
    broadcastFeedEvent({ __type: 'comment_updated', thread: ctx.thread, commentId, replyId, patch });

    const addedMentionUids = mentions
      .filter((mention) => !(existing.mentions ?? []).some((previous) => previous.uid === mention.uid))
      .map((mention) => mention.uid);
    if (addedMentionUids.length > 0) {
      void onCommentActivity(ctx, { actor: user, commentId: replyId, newMentionUids: addedMentionUids, snippet: text, onlyUids: addedMentionUids });
    }
    return { body: { ...existing, ...patch } };
  }

  async function deleteReply(ctx, req, user) {
    const { commentId, replyId } = req.params;
    const parent = await requireComment(ctx, commentId);
    const existing = requireReply(parent, replyId);
    requireAuthor(existing, user, 'Du kan bare slette dine egne svar.');

    // The last reply under a deleted comment takes the placeholder with it.
    const removesPlaceholder = parent.deleted && parent.replies.every((reply) => reply.id === replyId);
    if (removesPlaceholder) await removeTopLevelComment(ctx, commentId);
    else await updateComment(ctx, commentId, { $pull: { replies: { id: replyId } } });
    await commit(ctx, user);
    await deleteCommentImages(ctx.db, imageIdsOf(existing));
    await cleanupDeleted(ctx.db, [replyId]);
    if (removesPlaceholder) {
      broadcastFeedEvent({ __type: 'comment_deleted', thread: ctx.thread, commentId });
      return { body: { removedComment: true } };
    }
    broadcastFeedEvent({ __type: 'comment_deleted', thread: ctx.thread, commentId, replyId });
    return { status: 204 };
  }

  async function toggleReaction(ctx, req, user) {
    requireAllowed(allowReaction, user);
    const { commentId, replyId } = req.params;
    const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji.trim() : '';
    if (!COMMENT_REACTION_EMOJIS.includes(emoji)) throw new CommentError(400, 'Ugyldig emoji.');

    const comment = await requireComment(ctx, commentId);
    const target = replyId ? requireReply(comment, replyId) : comment;
    requireNotDeleted(target);
    const hasReacted = (target.reactions?.[emoji] ?? []).includes(user.uid);
    const field = `${replyId ? 'replies.$[r].' : ''}reactions.${emoji}`;

    await updateComment(
      ctx,
      commentId,
      hasReacted ? { $pull: { [field]: user.uid } } : { $addToSet: { [field]: user.uid } },
      replyId ? [{ 'r.id': replyId }] : [],
    );
    await commit(ctx, user);

    const fresh = await requireComment(ctx, commentId);
    const reactions = (replyId ? requireReply(fresh, replyId) : fresh).reactions ?? {};
    broadcastFeedEvent({ __type: 'comment_updated', thread: ctx.thread, commentId, ...(replyId ? { replyId } : {}), patch: { reactions } });
    if (!hasReacted) void notifyReaction(ctx, user, target, replyId ?? commentId, emoji);
    return { body: { reactions } };
  }

  /** Tell the author someone reacted to their comment (only on add, and not if they muted the thread). */
  async function notifyReaction(ctx, actor, entry, entryId, emoji) {
    try {
      const authorUid = entry.author?.uid;
      if (!authorUid || authorUid === actor.uid) return;
      if ((await muteLevels(ctx.db, ctx.thread, [authorUid])).has(authorUid)) return;
      await notify({
        type: 'reaction',
        recipients: [authorUid],
        actor,
        subject: 'comment',
        target: { kind: ctx.thread.kind, id: ctx.thread.id, commentId: entryId },
        context: threadContext(ctx),
        snippet: entry.text ?? '',
        emoji,
        link: threadPath(ctx.thread, entryId),
        groupKey: `reaction:${ctx.thread.kind}:${ctx.thread.id}:${entryId}`,
      });
    } catch (error) {
      console.error('[Comments] Failed to notify reaction', error);
    }
  }

  async function votePoll(ctx, req, user) {
    if (ctx.thread.kind !== 'event') throw new CommentError(400, 'Avstemninger finnes bare på arrangementer.');
    const { commentId } = req.params;
    const optionId = typeof req.body?.optionId === 'string' ? req.body.optionId : '';
    const comment = await requireComment(ctx, commentId);
    requireNotDeleted(comment);
    const poll = comment.poll;
    const option = poll?.options.find((entry) => entry.id === optionId);
    if (!poll || !option) throw new CommentError(404, 'Alternativet finnes ikke.');

    // $pull/$addToSet only touch this user's uid, so concurrent voters can't overwrite each other.
    const optionVotes = 'poll.options.$[o].votes';
    if (option.votes.includes(user.uid)) {
      await updateComment(ctx, commentId, { $pull: { [optionVotes]: user.uid } }, [{ 'o.id': optionId }]);
    } else {
      if (!poll.allowMultiple) {
        await updateComment(ctx, commentId, { $pull: { 'poll.options.$[].votes': user.uid } });
      }
      await updateComment(ctx, commentId, { $addToSet: { [optionVotes]: user.uid } }, [{ 'o.id': optionId }]);
    }
    await commit(ctx, user);

    const fresh = await requireComment(ctx, commentId);
    broadcastFeedEvent({ __type: 'comment_updated', thread: ctx.thread, commentId, patch: { poll: fresh.poll } });
    return { body: { poll: fresh.poll } };
  }

  /** Someone is writing in this thread; nothing is stored, it's only relayed to live clients. */
  async function typing(ctx, _req, user) {
    const key = `${user.uid}:${ctx.thread.kind}:${ctx.thread.id}`;
    const now = Date.now();
    if (now - (typingSentAt.get(key) ?? 0) >= TYPING_THROTTLE_MS) {
      typingSentAt.set(key, now);
      broadcastFeedEvent({ __type: 'typing', thread: ctx.thread, uid: user.uid, name: user.name });
      if (typingSentAt.size > 500) {
        for (const [entry, at] of typingSentAt) if (now - at > 60_000) typingSentAt.delete(entry);
      }
    }
    return { status: 204 };
  }

  /** level 'all' silences the thread for this user, 'mentions' lets direct @mentions through, null unmutes. */
  async function setMute(ctx, req, user) {
    const level = req.body?.level ?? null;
    if (level !== null && !MUTE_LEVELS.includes(level)) throw new CommentError(400, 'Ugyldig varslingsnivå.');

    const filter = { uid: user.uid, threadKind: ctx.thread.kind, threadId: ctx.thread.id };
    if (level === null) {
      await ctx.db.collection(COLLECTIONS.feedMutes).deleteOne(filter);
      return { body: { mute: null } };
    }

    await ctx.db.collection(COLLECTIONS.feedMutes).updateOne(filter, { $set: { level, updatedAt: Date.now() } }, { upsert: true });
    // Muting also takes the post back out of the user's bumped position.
    const feedItemIds = (await threadFeedItems(ctx)).map((item) => item.id);
    await ctx.db.collection(COLLECTIONS.feedBumps).deleteMany({
      uid: user.uid,
      feedItemId: { $in: feedItemIds },
      ...(level === 'mentions' ? { reason: { $ne: 'mention' } } : {}),
    });
    return { body: { mute: level } };
  }

  function registerRoutes(router) {
    const thread = '/comment-threads/:kind/:id';
    const base = `${thread}/comments`;
    router.post(`${thread}/typing`, route(typing));
    router.put(`${thread}/mute`, route(setMute));
    router.post(base, route(addComment));
    router.patch(`${base}/:commentId`, route(editComment));
    router.delete(`${base}/:commentId`, route(deleteComment));
    router.post(`${base}/:commentId/reactions`, route(toggleReaction));
    router.post(`${base}/:commentId/poll-votes`, route(votePoll));
    router.post(`${base}/:commentId/replies`, route(addReply));
    router.patch(`${base}/:commentId/replies/:replyId`, route(editReply));
    router.delete(`${base}/:commentId/replies/:replyId`, route(deleteReply));
    router.post(`${base}/:commentId/replies/:replyId/reactions`, route(toggleReaction));
  }

  return { registerRoutes, attachFeedExtras, notifyMentions, syncLegacyEventComments, deleteThreadImages };
}
