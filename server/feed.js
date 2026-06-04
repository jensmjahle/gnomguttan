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
