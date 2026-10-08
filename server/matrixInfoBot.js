import { createHash, randomUUID } from 'node:crypto';
import { buildMatrixEventNotice } from './matrixEventNotices.js';
import { createMatrixBotTransport, matrixBotErrorCode, readMatrixBotConfig } from './matrixBotTransport.js';

export const MATRIX_BOT_OUTBOX = 'matrix_bot_outbox';
export function createMatrixInfoBot({ getDatabase, config, env = process.env, createTransport = createMatrixBotTransport, logger = console, now = Date.now, intervalMs = 30000 } = {}) {
  try { config ||= readMatrixBotConfig(env); }
  catch { logger.error('[MatrixBot] Invalid configuration. Check MATRIX_BOT_* and APP_PUBLIC_URL. The existing bot is unaffected.'); config = { enabled: false }; }
  const owner = randomUUID(); let started = false; let stopped = false; let running; let timer; let transport; let connectionAttempts = 0; let nextConnectAt = 0;
  async function connect() {
    if (transport) return transport;
    if (now() < nextConnectAt) return null;
    try { transport = await createTransport(config, { logger }); connectionAttempts = 0; return transport; }
    catch (error) { connectionAttempts++; nextConnectAt = now() + Math.min(300000, 15000 * 2 ** Math.min(connectionAttempts, 5)); logger.error(`[MatrixBot] Connection failed (${matrixBotErrorCode(error)}). Will retry; event notices stay queued.`); return null; }
  }
  async function processPending() {
    if (!config.enabled || stopped) return;
    if (running) return running;
    running = (async () => {
      const db = await getDatabase(); const collection = db.collection(MATRIX_BOT_OUTBOX); const connection = await connect();
      if (!connection || stopped) return;
      for (let index = 0; index < 20 && !stopped; index++) {
        const time = now();
        const job = await collection.findOneAndUpdate({ state: 'pending', roomId: config.roomId, nextAttemptAt: { $lte: time }, leaseUntil: { $lte: time } }, { $set: { leaseUntil: time + 300000, leaseOwner: owner } }, { sort: { createdAt: 1, _id: 1 }, returnDocument: 'after' });
        if (!job) break;
        try {
          const prepared = await connection.prepare(job.roomId, job.content, job.prepared);
          await collection.updateOne({ _id: job._id, leaseOwner: owner }, { $set: { prepared } });
          const eventId = await connection.send(job.roomId, prepared, `gnom-event-${job._id}`);
          await collection.updateOne({ _id: job._id, leaseOwner: owner }, { $set: { state: 'sent', eventId, sentAt: new Date(now()), leaseUntil: 0 }, $unset: { leaseOwner: '', lastErrorCode: '', content: '', prepared: '' } });
        } catch (error) {
          const attempts = (job.attempts || 0) + 1; const code = matrixBotErrorCode(error);
          const delay = Math.min(300000, 10000 * 2 ** Math.min(attempts, 5));
          await collection.updateOne({ _id: job._id, leaseOwner: owner }, { $set: { attempts, lastErrorCode: code, nextAttemptAt: now() + delay, leaseUntil: 0 }, $unset: { leaseOwner: '' } });
          logger.warn(`[MatrixBot] Notice delivery failed (${code}); retry ${attempts} scheduled.`);
        }
      }
    })().catch(error => { logger.error(`[MatrixBot] Queue processing failed (${matrixBotErrorCode(error)}).`); }).finally(() => { running = undefined; });
    return running;
  }
  return {
    enabled: config.enabled,
    async enqueueChange(previous, event, actor) {
      if (!config.enabled) return false;
      if (previous?.status === 'published' && (!event || event.status !== 'published')) {
        const db = await getDatabase();
        await db.collection(MATRIX_BOT_OUTBOX).deleteMany({ communityEventId: previous.id, roomId: config.roomId, state: 'pending' });
      }
      const notice = buildMatrixEventNotice(previous, event, actor, config.publicUrl); if (!notice) return false;
      const id = createHash('sha256').update(JSON.stringify([config.roomId, notice.eventId, notice.revision, notice.kind, notice.content.body])).digest('hex');
      const db = await getDatabase();
      await db.collection(MATRIX_BOT_OUTBOX).updateOne({ _id: id }, { $setOnInsert: { roomId: config.roomId, communityEventId: notice.eventId, kind: notice.kind, content: notice.content, state: 'pending', createdAt: now(), nextAttemptAt: 0, attempts: 0, leaseUntil: 0 } }, { upsert: true });
      if (started && !stopped) void processPending();
      return true;
    },
    processPending,
    start() {
      if (!config.enabled || started) return;
      started = true; timer = setInterval(() => { void processPending(); }, intervalMs); timer.unref?.();
      logger.info('[MatrixBot] Event info bot enabled.'); void processPending();
    },
    async stop() {
      stopped = true; clearInterval(timer); await running; transport?.stop();
    },
  };
}
