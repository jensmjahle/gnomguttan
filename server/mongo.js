import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const isProduction = process.env.NODE_ENV === 'production';
const mongoUri = process.env.MONGODB_URI?.trim() ?? '';
const mongoDbName = resolveMongoDbName(process.env.MONGODB_DB, mongoUri);

let client;
let memoryServer;
let databasePromise;

export const COLLECTIONS = {
  users: 'users',
  events: 'community_events',
  overheard: 'overheard_quotes',
  feed: 'feed_items',
  statusrapportImages: 'statusrapport_images',
  feedReactions: 'feed_reactions',
  feedComments: 'feed_comments',
  feedBumps: 'feed_bumps',
  feedMutes: 'feed_mutes',
  commentImages: 'comment_images',
  notifications: 'notifications',
  notificationSettings: 'notification_settings',
  albums: 'albums',
  albumMedia: 'album_media',
  photoObligations: 'photo_obligations',
  pushTokens: 'push_tokens',
  pushState: 'push_state',
  accounts: 'accounts',
  sessions: 'sessions',
  authLinks: 'auth_links',
  counters: 'counters',
};

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = connectDatabase().catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }

  return databasePromise;
}

export async function ensureIndexes() {
  const db = await getDatabase();

  await Promise.all([
    db.collection(COLLECTIONS.users).createIndex({ uid: 1 }, { unique: true }),
    db.collection(COLLECTIONS.events).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.events).createIndex({ startsAt: 1, createdAt: -1 }),
    db.collection(COLLECTIONS.events).createIndex({ status: 1, startsAt: 1, createdAt: -1 }),
    db.collection(COLLECTIONS.events).createIndex({ 'createdBy.uid': 1, status: 1, createdAt: -1 }),
    db.collection(COLLECTIONS.overheard).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.overheard).createIndex({ createdAt: -1 }),
    db.collection(COLLECTIONS.feed).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.feed).createIndex({ createdAt: -1 }),
    db.collection(COLLECTIONS.feed).createIndex({ type: 1, 'payload.id': 1 }),
    db.collection(COLLECTIONS.feed).createIndex({ type: 1, createdAt: -1 }),
    db.collection(COLLECTIONS.statusrapportImages).createIndex({ createdAt: -1 }),
    db.collection(COLLECTIONS.feedReactions).createIndex({ feedItemId: 1 }),
    db.collection(COLLECTIONS.feedReactions).createIndex({ feedItemId: 1, uid: 1, emoji: 1 }, { unique: true }),
    db.collection(COLLECTIONS.feedComments).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.feedComments).createIndex({ feedItemId: 1, createdAt: 1 }),
    db.collection(COLLECTIONS.feedBumps).createIndex({ uid: 1, feedItemId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.feedBumps).createIndex({ uid: 1, bumpedAt: -1 }),
    db.collection(COLLECTIONS.feedMutes).createIndex({ uid: 1, threadKind: 1, threadId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.feedMutes).createIndex({ threadKind: 1, threadId: 1 }),
    db.collection(COLLECTIONS.commentImages).createIndex({ createdAt: -1 }),
    db.collection(COLLECTIONS.notifications).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.notifications).createIndex({ uid: 1, updatedAt: -1 }),
    db.collection(COLLECTIONS.notifications).createIndex({ uid: 1, readAt: 1 }),
    db.collection(COLLECTIONS.notifications).createIndex({ uid: 1, groupKey: 1, readAt: 1 }),
    db.collection(COLLECTIONS.notifications).createIndex({ 'target.commentId': 1 }),
    db.collection(COLLECTIONS.notifications).createIndex({ 'target.kind': 1, 'target.id': 1 }),
    // TTL needs a Date field; expiresAt is pushed forward whenever a grouped notification updates.
    db.collection(COLLECTIONS.notifications).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection(COLLECTIONS.notificationSettings).createIndex({ uid: 1 }, { unique: true }),
    db.collection(COLLECTIONS.albums).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.albums).createIndex({ eventId: 1 }),
    db.collection(COLLECTIONS.albums).createIndex({ createdAt: -1 }),
    db.collection(COLLECTIONS.albumMedia).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.albumMedia).createIndex({ albumId: 1, createdAt: -1 }),
    db.collection(COLLECTIONS.albumMedia).createIndex({ createdAt: -1 }),
    db.collection(COLLECTIONS.photoObligations).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.photoObligations).createIndex({ uid: 1, status: 1 }),
    db.collection(COLLECTIONS.photoObligations).createIndex({ eventId: 1, uid: 1 }, { unique: true }),
    db.collection(COLLECTIONS.pushTokens).createIndex({ token: 1 }, { unique: true }),
    db.collection(COLLECTIONS.pushTokens).createIndex({ uid: 1, disabledAt: 1 }),
    db.collection(COLLECTIONS.pushTokens).createIndex({ groupIds: 1, disabledAt: 1 }),
    db.collection(COLLECTIONS.accounts).createIndex({ uid: 1 }, { unique: true }),
    db.collection(COLLECTIONS.accounts).createIndex({ email: 1 }, { unique: true }),
    db.collection(COLLECTIONS.sessions).createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection(COLLECTIONS.sessions).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.sessions).createIndex({ uid: 1, lastUsedAt: -1 }),
    db.collection(COLLECTIONS.sessions).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection(COLLECTIONS.authLinks).createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection(COLLECTIONS.authLinks).createIndex({ kind: 1, uid: 1, usedAt: 1 }),
    // Used and expired links are kept for a month as a trail, then dropped.
    db.collection(COLLECTIONS.authLinks).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 }),
    db.collection(COLLECTIONS.pushState).createIndex({ key: 1 }, { unique: true }),
    db.collection('matrix_bot_outbox').createIndex({ state: 1, roomId: 1, nextAttemptAt: 1, leaseUntil: 1, createdAt: 1 }),
    db.collection('matrix_bot_outbox').createIndex({ sentAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }),
  ]);
}

export async function closeDatabase() {
  await client?.close();
  client = undefined;
  await memoryServer?.stop();
  memoryServer = undefined;
  databasePromise = undefined;
}

async function connectDatabase() {
  if (mongoUri) {
    try {
      return await connectToMongo(mongoUri);
    } catch (error) {
      if (isProduction) {
        throw error;
      }

      console.warn('[Mongo] Falling back to in-memory MongoDB for local development.');
      console.warn(error);
    }
  } else if (isProduction) {
    throw new Error('MONGODB_URI is required in production.');
  } else {
    console.warn('[Mongo] MONGODB_URI is not set. Starting in-memory MongoDB for local development.');
  }

  return connectToMemoryMongo();
}

async function connectToMongo(uri) {
  const mongoClient = new MongoClient(uri);
  await mongoClient.connect();
  client = mongoClient;
  return mongoClient.db(mongoDbName);
}

async function connectToMemoryMongo() {
  memoryServer ??= await MongoMemoryServer.create();
  const mongoClient = new MongoClient(memoryServer.getUri());
  await mongoClient.connect();
  client = mongoClient;
  return mongoClient.db(mongoDbName);
}

function resolveMongoDbName(explicitDbName, mongoUriValue) {
  const trimmedDbName = explicitDbName?.trim();
  if (trimmedDbName) {
    return trimmedDbName;
  }

  if (typeof mongoUriValue === 'string' && mongoUriValue.trim()) {
    try {
      const uri = new URL(mongoUriValue);
      const pathname = uri.pathname.replace(/^\/+/, '').trim();
      if (pathname) {
        return decodeURIComponent(pathname);
      }
    } catch {
      // Fall through to default database name.
    }
  }

  return 'gnomguttan';
}
