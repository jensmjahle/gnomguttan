import { appApi } from './appApi';

export function triggerMeow(): Promise<void> {
  return appApi.post('/meow', {});
}
