import { config } from '@/config';
import { botProxy } from '@/services/botProxy';
import type { CommunityEvent } from '@/types';

function buildInfoMessage(event: CommunityEvent) {
  const title = event.title.trim() || 'Et arrangement';
  return `${title} ble opprettet på gnomguttan.no. GÅ INN og SVAR om du KOMMER!`;
}

export const infoBot = {
  id: 'info',
  async announceEventCreated(event: CommunityEvent) {
    if (!config.vocechatBotInfoEnabled) {
      return;
    }

    const targetGroupId = config.vocechatBotTargetGroupId;
    if (!targetGroupId) {
      return;
    }

    await botProxy.sendTextToGroup(targetGroupId, buildInfoMessage(event));
  },
};
