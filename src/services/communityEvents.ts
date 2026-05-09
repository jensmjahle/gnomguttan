import { appApi } from '@/services/appApi';
import { useCommunityEventStore } from '@/store/communityEventStore';
import type { CommunityEvent, CommunityEventInput, EventRsvpStatus } from '@/types';

export async function loadCommunityEvents(): Promise<CommunityEvent[]> {
  const events = await appApi.get<CommunityEvent[]>('/community-events');
  useCommunityEventStore.getState().setEvents(events);
  return events;
}

export async function createCommunityEvent(input: CommunityEventInput): Promise<CommunityEvent> {
  const event = await appApi.post<CommunityEvent>('/community-events', input);
  useCommunityEventStore.getState().upsertEvent(event);
  return event;
}

export async function respondToCommunityEvent(eventId: string, status: EventRsvpStatus): Promise<CommunityEvent> {
  const event = await appApi.post<CommunityEvent>(`/community-events/${eventId}/respond`, { status });
  useCommunityEventStore.getState().upsertEvent(event);
  return event;
}
