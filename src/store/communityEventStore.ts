import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CommunityEvent, EventRsvpStatus, User } from '@/types';

interface CreateEventInput {
  title: string;
  startsAt: string;
  location?: string;
  description?: string;
  creator: Pick<User, 'uid' | 'name'>;
}

interface CommunityEventStore {
  events: CommunityEvent[];
  createEvent: (input: CreateEventInput) => string;
  respondToEvent: (eventId: string, responder: Pick<User, 'uid' | 'name'>, status: EventRsvpStatus) => void;
}

const STORAGE_KEY = 'gnomguttan-community-events';

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sortEvents(events: CommunityEvent[]) {
  return [...events].sort((left, right) => {
    const leftTime = new Date(left.startsAt).getTime();
    const rightTime = new Date(right.startsAt).getTime();
    return leftTime - rightTime || right.createdAt - left.createdAt;
  });
}

export const useCommunityEventStore = create<CommunityEventStore>()(
  persist(
    (set) => ({
      events: [],
      createEvent: (input) => {
        const id = createId();
        const parsedStartsAt = new Date(input.startsAt);
        if (Number.isNaN(parsedStartsAt.getTime())) {
          return '';
        }

        const nextEvent: CommunityEvent = {
          id,
          title: input.title.trim(),
          startsAt: parsedStartsAt.toISOString(),
          location: input.location?.trim() || undefined,
          description: input.description?.trim() || undefined,
          createdAt: Date.now(),
          createdBy: {
            uid: input.creator.uid,
            name: input.creator.name.trim(),
          },
          responses: [],
        };

        set((state) => ({ events: sortEvents([...state.events, nextEvent]) }));
        return id;
      },
      respondToEvent: (eventId, responder, status) => {
        set((state) => ({
          events: state.events.map((event) => {
            if (event.id !== eventId) return event;

            const remainingResponses = event.responses.filter((response) => response.uid !== responder.uid);
            return {
              ...event,
              responses: [
                ...remainingResponses,
                {
                  uid: responder.uid,
                  name: responder.name.trim(),
                  status,
                  respondedAt: Date.now(),
                },
              ],
            };
          }),
        }));
      },
    }),
    {
      name: STORAGE_KEY,
    }
  )
);
