import { botService } from '@/services/bots';
import { useCommunityEventStore } from '@/store/communityEventStore';
import type { CommunityEventInput, EventRsvpStatus, User } from '@/types';

export function createCommunityEvent(input: CommunityEventInput) {
  const event = useCommunityEventStore.getState().createEvent(input);
  if (event) {
    void botService.notifyEventCreated(event).catch((error) => {
      console.error('[Bot] Failed to announce event creation', error);
    });
  }
  return event;
}

export function respondToCommunityEvent(eventId: string, responder: Pick<User, 'uid' | 'name'>, status: EventRsvpStatus) {
  useCommunityEventStore.getState().respondToEvent(eventId, responder, status);
}
