import { appApi } from '@/services/appApi';

// Meows arrive on the live feed stream; the header cat listens here.
const listeners = new Set<() => void>();
let suppress = 0;

export function onMeow(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function emitMeow() {
  if (suppress > 0) { suppress--; return; }
  listeners.forEach((listener) => listener());
}

/** Send a meow to everyone with the website or app open. Our own echo is skipped. */
export function triggerMeow(): Promise<void> {
  suppress++;
  return appApi.post('/meow', {});
}
