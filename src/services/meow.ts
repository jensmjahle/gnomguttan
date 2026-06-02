import { appApi } from './appApi';

let suppressCount = 0;

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
