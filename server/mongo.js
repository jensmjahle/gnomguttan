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
    db.collection(COLLECTIONS.overheard).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.overheard).createIndex({ createdAt: -1 }),
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
