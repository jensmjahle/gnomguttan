import { create } from 'zustand';
import type { CommunityEvent } from '@/types';
import { applyCommentEvent, type CommentEvent } from '@/utils/comments';

interface CommunityEventStore {
  events: CommunityEvent[];
  setEvents: (events: CommunityEvent[]) => void;
  upsertEvent: (event: CommunityEvent) => void;
  removeEvent: (eventId: string) => void;
  applyCommentEvent: (eventId: string, event: CommentEvent) => void;
}

function sortEvents(events: CommunityEvent[]) {
  return [...events].sort((left, right) => {
    const leftTime = new Date(left.startsAt).getTime();
    const rightTime = new Date(right.startsAt).getTime();
    return leftTime - rightTime || right.createdAt - left.createdAt;
  });
}

function mergeEvents(currentEvents: CommunityEvent[], nextEvents: CommunityEvent[]) {
  const nextById = new Map(currentEvents.map((event) => [event.id, event] as const));

  for (const event of nextEvents) {
    nextById.set(event.id, event);
  }

  return sortEvents([...nextById.values()]);
}

export const useCommunityEventStore = create<CommunityEventStore>()((set) => ({
  events: [],
  setEvents: (events) =>
    set({
      events: sortEvents(events),
    }),
  upsertEvent: (event) =>
    set((state) => {
      return {
        events: mergeEvents(state.events, [event]),
      };
    }),
  removeEvent: (eventId) =>
    set((state) => ({
      events: state.events.filter((event) => event.id !== eventId),
    })),
  applyCommentEvent: (eventId, commentEvent) =>
    set((state) => ({
      events: state.events.map((event) =>
        event.id === eventId ? { ...event, comments: applyCommentEvent(event.comments ?? [], commentEvent) } : event
      ),
    })),
}));
