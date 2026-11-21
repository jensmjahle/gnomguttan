import { useQuery } from '@tanstack/react-query';
import { qk, queryClient } from '@/data/queryClient';
import { loadCommunityEvent, loadCommunityEvents } from '@/services/communityEvents';
import type { CommunityEvent } from '@/types';

export function useCommunityEvents() {
  return useQuery({ queryKey: qk.events, queryFn: () => loadCommunityEvents({ includeDrafts: true }), staleTime: 60_000 });
}

export function useCommunityEvent(eventId: string) {
  return useQuery({
    queryKey: qk.event(eventId),
    queryFn: () => loadCommunityEvent(eventId),
    // Show the list's copy instantly while the full event loads.
    placeholderData: () => queryClient.getQueryData<CommunityEvent[]>(qk.events)?.find((event) => event.id === eventId),
  });
}

/** Put a changed event everywhere it's cached. */
export function storeEvent(event: CommunityEvent) {
  queryClient.setQueryData(qk.event(event.id), event);
  queryClient.setQueryData<CommunityEvent[]>(qk.events, (list) => (list ? (list.some((item) => item.id === event.id) ? list.map((item) => (item.id === event.id ? event : item)) : [event, ...list]) : list));
}

export function forgetEvent(eventId: string) {
  queryClient.removeQueries({ queryKey: qk.event(eventId) });
  queryClient.setQueryData<CommunityEvent[]>(qk.events, (list) => list?.filter((item) => item.id !== eventId));
}
