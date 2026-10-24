import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

export function signPushKey(token, secret) {
  const payload = Buffer.from(token).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function verifyPushKey(key, secret) {
  if (typeof key !== 'string' || key.length > 512 || !secret || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return null;
  const [payload, signature] = key.split('.');
  if (!payload || !signature) return null;
  const expected = signPushKey(Buffer.from(payload, 'base64url').toString(), secret);
  if (key.length !== expected.length || !timingSafeEqual(Buffer.from(key), Buffer.from(expected))) return null;
  const token = Buffer.from(payload, 'base64url').toString();
  return /^(ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/.test(token) ? token : null;
}
export function registerMatrixMobilePush(app, { fetchImpl = fetch } = {}) {
  const secret = process.env.MATRIX_MOBILE_PUSH_SECRET;
  const homeserver = (process.env.MATRIX_HOMESERVER_URL || 'https://gnomchat.gnomguttan.no').replace(/\/$/, '');
  const publicUrl = (process.env.MATRIX_MOBILE_PUBLIC_URL || 'https://gnomguttan.no').replace(/\/$/, '');
  const delivered = new Map();
  const inFlight = new Map();
  app.post('/matrix-mobile/register', express.json({ limit: '4kb' }), async (req, res) => {
    if (!secret) return res.status(503).json({ error: 'MATRIX_MOBILE_PUSH_SECRET is not configured' });
    const { token, baseUrl } = req.body || {};
    if (baseUrl !== homeserver || typeof token !== 'string' || !/^(ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/.test(token)) return res.status(400).json({ error: 'Invalid registration' });
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) return res.sendStatus(401);
    try {
      const who = await fetchImpl(`${homeserver}/_matrix/client/v3/account/whoami`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(10000) });
      if (!who.ok) return res.sendStatus(who.status === 401 ? 401 : 502);
      res.json({ pushkey: signPushKey(token, secret), url: `${publicUrl}/_matrix/push/v1/notify` });
    } catch { res.sendStatus(502); }
  });
  app.post('/_matrix/push/v1/notify', express.json({ limit: '64kb' }), async (req, res) => {
    if (!secret) return res.sendStatus(503);
    const notification = req.body?.notification;
    if (!notification || !Array.isArray(notification.devices) || notification.devices.length > 100) return res.sendStatus(400);
    const rejected = [];
    try {
      for (const [key, timestamp] of delivered) if (timestamp < Date.now() - 86400000) delivered.delete(key);
      for (const device of notification.devices) {
        const token = verifyPushKey(device.pushkey, secret);
        if (!token || device.app_id !== 'no.gnomguttan.gnomchat') { rejected.push(device.pushkey); continue; }
        const hasEvent = typeof notification.event_id === 'string' && typeof notification.room_id === 'string';
        const key = `${device.pushkey}|${notification.event_id}`;
        if (hasEvent && delivered.has(key)) continue;
        let delivery = hasEvent ? inFlight.get(key) : undefined;
        if (!delivery) {
          delivery = (async () => {
            const result = await fetchImpl('https://exp.host/--/api/v2/push/send', {
              method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
              signal: AbortSignal.timeout(10000),
              body: JSON.stringify({ to: token, title: hasEvent ? 'GnomChat' : undefined, body: hasEvent ? 'Du har en ny melding' : undefined,
                sound: hasEvent && typeof device.tweaks?.sound === 'string' && device.tweaks.sound ? 'default' : undefined, channelId: 'messages',
                badge: Math.max(0, Number(notification.counts?.unread) || 0),
                data: { roomId: notification.room_id, eventId: notification.event_id, matrix: true } }),
            });
            if (!result.ok) throw new Error('Expo unavailable');
            const receipt = (await result.json()).data;
            if (!receipt || !['ok', 'error'].includes(receipt.status)) throw new Error('Invalid Expo response');
            return receipt;
          })();
          if (hasEvent) inFlight.set(key, delivery);
        }
        let receipt;
        try { receipt = await delivery; }
        finally { if (inFlight.get(key) === delivery) inFlight.delete(key); }
        if (receipt?.status === 'error') {
          if (receipt.details?.error === 'DeviceNotRegistered') rejected.push(device.pushkey);
          else throw new Error('Expo rejected push');
        } else {
          if (delivered.size >= 20000) delivered.delete(delivered.keys().next().value);
          if (hasEvent) delivered.set(key, Date.now());
        }
      }
      res.json({ rejected });
    } catch { res.sendStatus(502); }
  });
}
