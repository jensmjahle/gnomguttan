import { create } from 'zustand';
import type { CommunityEvent } from '@/types';

interface CommunityEventStore {
  events: CommunityEvent[];
  setEvents: (events: CommunityEvent[]) => void;
  upsertEvent: (event: CommunityEvent) => void;
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
    set((state) => ({
      events: mergeEvents(state.events, events),
    })),
  upsertEvent: (event) =>
    set((state) => {
      return {
        events: mergeEvents(state.events, [event]),
      };
    }),
}));
