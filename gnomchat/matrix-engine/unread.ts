export function firstUnreadId(events: { id: string; sender: string }[], readEventId: string | null, unreadCount: number, myId: string): string | null {
  const index = readEventId ? events.findIndex(event => event.id === readEventId) : -1;
  if (index < 0 && unreadCount <= 0) return null;
  return events.slice(index + 1).find(event => event.sender !== myId)?.id || null;
}
