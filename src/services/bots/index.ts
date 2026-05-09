import type { CommunityEvent } from '@/types';
import { infoBot } from './infoBot';

interface BotHandler {
  id: string;
  announceEventCreated?: (event: CommunityEvent) => Promise<void>;
}

const bots: BotHandler[] = [infoBot];

export const botService = {
  async notifyEventCreated(event: CommunityEvent) {
    const tasks = bots.flatMap((bot) => {
      const handler = bot.announceEventCreated;
      if (!handler) {
        return [];
      }

      return [Promise.resolve().then(() => handler(event))];
    });

    await Promise.allSettled(tasks);
  },
};
