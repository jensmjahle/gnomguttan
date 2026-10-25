import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { useMatrixMobileStore } from '@/store/matrixMobileStore';
import type { MatrixSession, MatrixMessage } from '@/types/matrix';

const SESSION_KEY = 'gnomchat-matrix-session';
let transport: ((value: unknown) => void) | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const mediaCache = new Map<string, Promise<string>>();
export function attachMatrixTransport(send: ((value: unknown) => void) | null) {
  transport = send;
  if (!send) {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Matrix starter på nytt. Prøv igjen.')); }
    pending.clear();
  }
}
export function matrixCall<T = void>(method: string, args: unknown = {}): Promise<T> {
  if (!transport) return Promise.reject(new Error('Matrix starter fortsatt. Prøv igjen om litt.'));
  const send = transport;
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Matrix svarte ikke. Prøv igjen.')); }, 90_000);
    pending.set(id, { resolve, reject, timer });
    try { send({ id, method, args }); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
}
export function handleMatrixResponse(data: { id: number; result?: unknown; error?: string }) {
  const entry = pending.get(data.id);
  if (!entry) return;
  clearTimeout(entry.timer); pending.delete(data.id);
  if (data.error) entry.reject(new Error(data.error)); else entry.resolve(data.result);
}
export async function hydrateMatrixSession() {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    const session = raw ? JSON.parse(raw) as MatrixSession : null;
    if (session && ['baseUrl', 'accessToken', 'userId', 'deviceId'].every(key => typeof session[key as keyof MatrixSession] === 'string')) {
      useMatrixMobileStore.setState({ session, authenticated: true, userId: session.userId });
    }
  } catch { /* An unavailable/corrupt saved session should show the native login. */ }
  finally { useMatrixMobileStore.setState({ hydrated: true }); }
}
export async function loginMatrix(username: string, password: string, host: string) {
  const url = new URL(host.includes('://') ? host.trim() : `https://${host.trim()}`);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Oppgi Matrix-serverens HTTPS-adresse.');
  const session = await matrixCall<MatrixSession>('login', { baseUrl: url.href.replace(/\/$/, ''), username: username.trim(), password });
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  useMatrixMobileStore.setState({ session, authenticated: true, userId: session.userId, error: null });
}
export async function clearMatrixSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
  mediaCache.clear();
  useMatrixMobileStore.setState({ session: null, authenticated: false, userId: null, rooms: [], messages: {}, typing: [],
    activeRoom: null, pendingRoom: null, unreadCount: 0, chatVisible: false, notificationError: null, verification: null });
}
export async function logoutMatrix() {
  try { await matrixCall('logout'); } finally { await clearMatrixSession(); }
}
export function matrixMediaUri(message: MatrixMessage): Promise<string> {
  const key = `${useMatrixMobileStore.getState().userId}|${message.id}`;
  const existing = mediaCache.get(key);
  if (existing) return existing;
  const result = loadMatrixMedia(message).catch(error => { mediaCache.delete(key); throw error; });
  mediaCache.set(key, result);
  return result;
}
async function loadMatrixMedia(message: MatrixMessage): Promise<string> {
  if (!message.media) throw new Error('Meldingen har ikke noe vedlegg.');
  const data = await matrixCall<string>('media', message.media);
  const [header, base64] = data.split(',');
  if (!base64 || !header.startsWith('data:')) throw new Error('Ugyldig vedlegg.');
  const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'application/pdf': 'pdf' };
  const mime = message.media.mimetype || header.slice(5).split(';')[0];
  const uri = `${FileSystem.cacheDirectory}matrix-${message.id.replace(/[^a-z0-9]/gi, '_')}.${extensions[mime] || 'bin'}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}
