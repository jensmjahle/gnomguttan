import { vocechatService } from '@/services/vocechat';
import type { CommunityEventPerson, CommunityEventReactions, FeedReaction } from '@/types';

export function getPersonAvatar(person: CommunityEventPerson) {
  return person.avatarUpdatedAt !== undefined
    ? vocechatService.avatarUrl(person.uid, person.avatarUpdatedAt)
    : vocechatService.avatarUrl(person.uid);
}

/** Prefer the user directory's current name and avatar over the copy stored with a post. */
export function resolvePerson(person: CommunityEventPerson, usersByUid: Map<number, CommunityEventPerson>) {
  return usersByUid.get(person.uid) ?? person;
}

/** Convert { emoji: uids[] } reactions into the flat list ReactionBar renders. */
export function toFeedReactions(
  reactions: CommunityEventReactions | undefined,
  usersByUid: Map<number, CommunityEventPerson>
): FeedReaction[] {
  return Object.entries(reactions ?? {}).flatMap(([emoji, uids]) =>
    uids.map((uid) => ({ emoji, uid, actorName: usersByUid.get(uid)?.name ?? 'Ukjent' }))
  );
}
