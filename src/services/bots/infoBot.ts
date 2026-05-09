import { config } from '@/config';
import { botProxy } from '@/services/botProxy';
import type { CommunityEvent } from '@/types';

const INFO_MESSAGE = 'Det er opprettet et arrangement som du må inn å svare på din gnom på gnomguttan.no.';

export const infoBot = {
  id: 'info',
  async announceEventCreated(_event: CommunityEvent) {
    if (!config.vocechatBotInfoEnabled) {
      return;
    }

    const targetGroupId = config.vocechatBotTargetGroupId;
    if (!targetGroupId) {
      return;
    }

    await botProxy.sendTextToGroup(targetGroupId, INFO_MESSAGE);
  },
};
