// Shape-checking for community event comments, replies, polls and people.
// Shared by server/index.js (event documents) and the comment service, and
// importable by tests without starting the server.
import { normalizeCommentMentions } from './comments.js';

export function normalizeCommunityEventPerson(value, fallbackName = 'Ukjent') {
  const uid = Number(value?.uid);
  const name = typeof value?.name === 'string' && value.name.trim() ? value.name.trim() : fallbackName;
  const avatarUpdatedAt = Number(value?.avatarUpdatedAt);

  return {
    uid: Number.isFinite(uid) ? uid : 0,
    name,
    ...(Number.isFinite(avatarUpdatedAt) ? { avatarUpdatedAt } : {}),
  };
}

export function normalizeNumberList(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isFinite(value)))];
}

export function normalizeCommunityEventPollOption(value) {
  const id = typeof value?.id === 'string' ? value.id.trim() : '';
  const label = typeof value?.label === 'string' ? value.label.trim() : '';
  const imageUrl = normalizeCommunityEventImageUrl(value?.imageUrl);
  // An option needs a label or a picture — an image-only option is valid.
  if (!id || (!label && !imageUrl)) {
    return null;
  }

  return {
    id,
    label,
    ...(imageUrl ? { imageUrl } : {}),
    votes: normalizeNumberList(value?.votes),
  };
}

export function normalizeCommunityEventPoll(value, author, createdAt) {
  const id = typeof value?.id === 'string' ? value.id.trim() : '';
  const question = typeof value?.question === 'string' ? value.question.trim() : '';
  if (!id || !question) {
    return null;
  }

  return {
    id,
    question,
    allowMultiple: Boolean(value?.allowMultiple),
    options: (Array.isArray(value?.options) ? value.options : [])
      .map(normalizeCommunityEventPollOption)
      .filter(Boolean),
    createdAt: Number.isFinite(Number(value?.createdAt)) ? Number(value.createdAt) : createdAt,
    createdBy: normalizeCommunityEventPerson(value?.createdBy ?? author, author.name),
  };
}

export function normalizeCommunityEventComment(value) {
  const id = typeof value?.id === 'string' ? value.id.trim() : '';
  const text = typeof value?.text === 'string' ? value.text.trim() : '';
  const imageUrl = normalizeCommunityEventImageUrl(value?.imageUrl);
  const imageId = normalizeCommentImageId(value?.imageId);
  const author = normalizeCommunityEventPerson(value?.author);
  const createdAt = Number.isFinite(Number(value?.createdAt)) ? Number(value.createdAt) : Date.now();
  const replies = (Array.isArray(value?.replies) ? value.replies : [])
    .map(normalizeCommunityEventCommentReply)
    .filter(Boolean);

  // A deleted comment that still has replies stays as an empty placeholder.
  if (id && value?.deleted === true && replies.length > 0) {
    const deletedAt = Number(value?.deletedAt);
    return { id, author, createdAt, deleted: true, deletedAt: Number.isFinite(deletedAt) ? deletedAt : createdAt, text: '', replies };
  }

  if (!id || (!text && !imageUrl && !imageId && !value?.poll)) {
    return null;
  }

  const poll = value?.poll ? normalizeCommunityEventPoll(value.poll, author, createdAt) : null;

  if (!text && !imageUrl && !imageId && !poll) {
    return null;
  }

  const reactions = normalizeCommunityEventReactions(value?.reactions);
  const mentions = normalizeCommentMentions(value?.mentions);
  const editedAt = Number(value?.editedAt);

  return {
    id,
    author,
    ...(text ? { text } : {}),
    ...(mentions.length > 0 ? { mentions } : {}),
    createdAt,
    ...(Number.isFinite(editedAt) && editedAt > 0 ? { editedAt } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(imageId ? { imageId } : {}),
    ...(poll ? { poll } : {}),
    ...(replies.length > 0 ? { replies } : {}),
    ...(reactions ? { reactions } : {}),
  };
}

export function normalizeCommunityEventCommentReply(value) {
  const id = typeof value?.id === 'string' ? value.id.trim() : '';
  const text = typeof value?.text === 'string' ? value.text.trim() : '';
  const imageId = normalizeCommentImageId(value?.imageId);

  if (!id || (!text && !imageId)) {
    return null;
  }

  const reactions = normalizeCommunityEventReactions(value?.reactions);
  const mentions = normalizeCommentMentions(value?.mentions);
  const editedAt = Number(value?.editedAt);

  return {
    id,
    author: normalizeCommunityEventPerson(value?.author),
    text,
    ...(mentions.length > 0 ? { mentions } : {}),
    createdAt: Number.isFinite(Number(value?.createdAt)) ? Number(value.createdAt) : Date.now(),
    ...(Number.isFinite(editedAt) && editedAt > 0 ? { editedAt } : {}),
    ...(imageId ? { imageId } : {}),
    ...(reactions ? { reactions } : {}),
  };
}

/** Uploaded comment images are referenced by their comment_images ObjectId. */
export function normalizeCommentImageId(value) {
  return typeof value === 'string' && /^[a-f0-9]{24}$/.test(value) ? value : '';
}

/** Reactions are stored as { emoji: [uid, ...] }; empty buckets are dropped. */
export function normalizeCommunityEventReactions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const result = {};
  for (const [emoji, uids] of Object.entries(value)) {
    const key = typeof emoji === 'string' ? emoji.trim().slice(0, 16) : '';
    const voters = normalizeNumberList(uids);
    if (key && voters.length > 0) {
      result[key] = voters;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/** Post images arrive as resized data URLs from the client; http(s) URLs are also allowed. */
export function normalizeCommunityEventImageUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return '';
  }

  const isDataImage = /^data:image\/[a-z0-9.+-]+;base64,/i.test(raw);
  const isHttp = /^https?:\/\//i.test(raw);
  if (!isDataImage && !isHttp) {
    return '';
  }

  // Guard against oversized payloads bloating the event document (~4 MB of base64).
  return raw.length > 4_000_000 ? '' : raw;
}
