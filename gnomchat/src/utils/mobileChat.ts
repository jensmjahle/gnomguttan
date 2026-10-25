export function isChatDocument(candidate: string, chatUrl: string): boolean {
  try {
    const actual = new URL(candidate);
    const expected = new URL(chatUrl);
    return actual.origin === expected.origin &&
      actual.pathname.replace(/\/+$/, '') === expected.pathname.replace(/\/+$/, '');
  } catch {
    return false;
  }
}

export function shouldPresentMessage(
  data: Record<string, unknown> | undefined,
  state: { activeRoom: string | null; chatVisible: boolean },
  appActive: boolean,
): boolean {
  if (typeof data?.eventId !== 'string' || !data.eventId) return false;
  return !(appActive && state.chatVisible && data.roomId === state.activeRoom);
}
