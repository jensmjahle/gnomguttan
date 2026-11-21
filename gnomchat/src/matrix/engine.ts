import type WebView from 'react-native-webview';
import {
  ENGINE_PROTOCOL_VERSION, type EngineCommands, type EngineCommandName, type EngineEvent,
} from '@/matrix/protocol.generated';
import { useMatrixSession, useMatrixStore } from '@/matrix/store';

// The app side of the bridge to the Matrix engine (see protocol.generated.ts).
// Commands are queued until the engine page has loaded, and each resolves with
// the engine's reply.

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

let webView: WebView | null = null;
let ready = false;
let nextId = 1;
const pending = new Map<number, Pending>();
const queue: string[] = [];
const eventListeners = new Set<(event: EngineEvent) => void>();

export class MatrixError extends Error {
  constructor(message: string, public readonly errcode?: string) { super(message); this.name = 'MatrixError'; }
}

function deliver(message: string) {
  // injectJavaScript runs in the page; JSON is valid JS, so the message needs no escaping.
  webView?.injectJavaScript(`window.gnomEngine && window.gnomEngine.receive(${message}); true;`);
}

export function attachWebView(view: WebView | null) {
  webView = view;
}

/** The engine page went away (reload, crash): fail what was in flight. */
export function engineLost(reason: string) {
  ready = false;
  useMatrixStore.setState({ engineReady: false });
  for (const [id, entry] of pending) {
    clearTimeout(entry.timer);
    entry.reject(new MatrixError(reason));
    pending.delete(id);
  }
}

const TIMEOUTS: Partial<Record<EngineCommandName, number>> = { sendFile: 10 * 60_000, media: 2 * 60_000, restoreHistory: 5 * 60_000, login: 60_000 };

export function call<K extends EngineCommandName>(cmd: K, args: EngineCommands[K]['args']): Promise<EngineCommands[K]['result']> {
  const id = nextId++;
  const message = JSON.stringify({ id, cmd, args });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new MatrixError('Chatten svarte ikke. Prøv igjen.'));
    }, TIMEOUTS[cmd] ?? 45_000);
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
    if (ready) deliver(message);
    else queue.push(message);
  });
}

export function onEngineEvent(listener: (event: EngineEvent) => void) {
  eventListeners.add(listener);
  return () => { eventListeners.delete(listener); };
}

export function handleEngineMessage(raw: string) {
  let event: EngineEvent;
  try { event = JSON.parse(raw) as EngineEvent; } catch { return; }
  const store = useMatrixStore.getState();

  switch (event.event) {
    case 'ready': {
      if (event.version !== ENGINE_PROTOCOL_VERSION) {
        useMatrixStore.setState({ engineError: 'Chatten på serveren er en annen versjon enn appen. Oppdater GnomChat.' });
      }
      ready = true;
      useMatrixStore.setState({ engineReady: true, engineError: null });
      const session = useMatrixSession.getState().session;
      if (session) deliver(JSON.stringify({ id: nextId++, cmd: 'start', args: { session } }));
      while (queue.length) deliver(queue.shift()!);
      break;
    }
    case 'status':
      useMatrixStore.setState({ status: event.status, statusDetail: event.detail ?? '', cryptoReady: event.cryptoReady });
      break;
    case 'sessionInvalid':
      useMatrixSession.getState().setSession(null);
      store.reset();
      useMatrixStore.setState({ engineReady: ready, engineError: event.reason });
      break;
    case 'rooms':
      store.setRooms(event.rooms);
      break;
    case 'timeline':
      store.setTimeline(event.timeline);
      break;
    case 'upload':
      useMatrixStore.setState((state) => ({ uploads: { ...state.uploads, [event.roomId]: event.progress } }));
      break;
    case 'verification':
      useMatrixStore.setState({ verification: event.verification });
      break;
    case 'reply': {
      const entry = pending.get(event.id);
      if (!entry) break;
      pending.delete(event.id);
      clearTimeout(entry.timer);
      if (event.ok) entry.resolve(event.result);
      else entry.reject(new MatrixError(event.error, event.errcode));
      break;
    }
  }
  eventListeners.forEach((listener) => listener(event));
}

// ── Session helpers ──────────────────────────────────────────────────────────

export async function matrixLogin(baseUrl: string, user: string, password: string, deviceName: string) {
  const session = await call('login', { baseUrl, user, password, deviceName });
  useMatrixSession.getState().setSession(session);
  return session;
}

export async function matrixLogout() {
  try { await call('logout', {}); } finally {
    useMatrixSession.getState().setSession(null);
    useMatrixStore.getState().reset();
    useMatrixStore.setState({ engineReady: ready });
  }
}
