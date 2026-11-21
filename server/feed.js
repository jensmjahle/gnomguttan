import { randomUUID } from 'node:crypto';
import { COLLECTIONS, getDatabase } from './mongo.js';

/**
 * Write a typed item into the feed_items collection.
 * All feed producers (event creation, GitHub webhook, etc.) call this.
 *
 * @param {object} opts
 * @param {string} opts.type        - Discriminator, e.g. 'community_event_created'
 * @param {string} opts.source      - 'internal' | 'github' | string
 * @param {unknown} opts.payload    - Type-specific data
 * @param {number} [opts.actorUid]  - Internal user id (when available)
 * @param {string} [opts.actorName] - Display name of the actor
 * @param {number} [opts.createdAt] - Override timestamp (defaults to Date.now())
 */
export async function writeFeedItem({ type, source, payload, actorUid, actorName, createdAt }) {
  const db = await getDatabase();
  const item = {
    id: randomUUID(),
    type,
    source,
    payload,
    createdAt: createdAt ?? Date.now(),
    ...(actorUid !== undefined ? { actorUid } : {}),
    ...(actorName !== undefined ? { actorName } : {}),
  };
  await db.collection(COLLECTIONS.feed).insertOne(item);
  return sanitizeFeedDocument(item);
}

export function sanitizeFeedDocument(document) {
  const { _id, ...rest } = document;
  return rest;
}

/**
 * Merge one page of a user's feed. Bumped items sort by when they were bumped
 * (and are excluded from `fresh`); everything else sorts by createdAt. Both
 * inputs are fetched with limit + 1 rows, so a merged surplus means more pages.
 *
 * @param {object} opts
 * @param {object[]} opts.fresh        - Unbumped feed items, newest first
 * @param {object[]} opts.bumps        - This user's feed_bumps rows, newest first
 * @param {object[]} opts.bumpedItems  - The feed items those bumps point at
 * @param {number} opts.limit
 */
export function mergeBumpedFeedPage({ fresh, bumps, bumpedItems, limit }) {
  const bumpedById = new Map(bumpedItems.map((item) => [item.id, item]));
  const entries = [
    ...fresh.map((item) => ({ ...item, sortAt: item.createdAt })),
    ...bumps.flatMap((bump) => {
      const item = bumpedById.get(bump.feedItemId);
      if (!item) return [];
      return [{
        ...item,
        sortAt: bump.bumpedAt,
        bump: {
          at: bump.bumpedAt,
          reason: bump.reason,
          byUid: bump.byUid,
          byName: bump.byName,
          ...(bump.commentId ? { commentId: bump.commentId } : {}),
        },
      }];
    }),
  ].sort((a, b) => b.sortAt - a.sortAt);

  return {
    items: entries.slice(0, limit).map(sanitizeFeedDocument),
    hasMore: entries.length > limit,
  };
}

/** `?types=a,b` → a list of feed types (an empty list hides everything); no param → no filter. */
export function parseFeedTypes(value) {
  if (typeof value !== 'string') return undefined;
  const types = value.split(',').map((type) => type.trim()).filter((type) => /^[a-z0-9_]{1,64}$/.test(type));
  return [...new Set(types)].slice(0, 50);
}

/**
 * One page of a user's feed. Posts bumped for them (by comment activity) sort by
 * their bump time. With `types`, filtering happens here rather than in the
 * browser, so a page is always `limit` posts the user can actually see.
 */
/** One person's own posts, newest first, without anyone's bumps (their profile's mini feed). */
export async function queryActorFeedPage(db, { actorUid, before, limit, types }) {
  const items = await db.collection(COLLECTIONS.feed)
    .find({
      actorUid,
      ...(types ? { type: { $in: types } } : {}),
      ...(Number.isFinite(before) ? { createdAt: { $lt: before } } : {}),
    })
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .toArray();
  return {
    items: items.slice(0, limit).map((item) => sanitizeFeedDocument({ ...item, sortAt: item.createdAt })),
    hasMore: items.length > limit,
  };
}

export async function queryFeedPage(db, { uid, before, limit, types }) {
  const beforeFilter = Number.isFinite(before) ? { $lt: before } : undefined;
  const typeFilter = types ? { type: { $in: types } } : {};
  const bumpsCollection = db.collection(COLLECTIONS.feedBumps);
  const feedCollection = db.collection(COLLECTIONS.feed);

  const bumpedIds = await bumpsCollection.distinct('feedItemId', { uid });
  // Only bumps of the visible types take a place on the page.
  const visibleBumpedIds = types && bumpedIds.length > 0
    ? await feedCollection.distinct('id', { id: { $in: bumpedIds }, ...typeFilter })
    : bumpedIds;

  const [bumps, fresh] = await Promise.all([
    visibleBumpedIds.length > 0
      ? bumpsCollection
        .find({ uid, feedItemId: { $in: visibleBumpedIds }, ...(beforeFilter ? { bumpedAt: beforeFilter } : {}) })
        .sort({ bumpedAt: -1 })
        .limit(limit + 1)
        .toArray()
      : [],
    feedCollection
      .find({
        ...(bumpedIds.length > 0 ? { id: { $nin: bumpedIds } } : {}),
        ...typeFilter,
        ...(beforeFilter ? { createdAt: beforeFilter } : {}),
      })
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .toArray(),
  ]);
  const bumpedItems = bumps.length > 0
    ? await feedCollection.find({ id: { $in: bumps.map((bump) => bump.feedItemId) } }).toArray()
    : [];

  return mergeBumpedFeedPage({ fresh, bumps, bumpedItems, limit });
}
