import { appApi } from './appApi';

let suppressCount = 0;
const meowListeners = new Set<() => void>();

/**
 * Meows arrive on the shared live feed stream (one connection per tab), which
 * calls emitMeow(); the Navbar cat subscribes here.
 */
export function onMeow(listener: () => void): () => void {
  meowListeners.add(listener);
  return () => { meowListeners.delete(listener); };
}

export function emitMeow(): void {
  meowListeners.forEach((listener) => listener());
}

export function suppressNextCat(): void {
  suppressCount++;
}

export function consumeCatSuppression(): boolean {
  if (suppressCount > 0) { suppressCount--; return true; }
  return false;
}

export function triggerMeow(): Promise<void> {
  return appApi.post('/meow', {});
}
