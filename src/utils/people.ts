import { avatarUrl } from '@/utils/avatar';
import type { CommunityEventPerson, CommunityEventReactions, FeedReaction } from '@/types';

export function getPersonAvatar(person: CommunityEventPerson) {
  return avatarUrl(person.uid, person.avatarUpdatedAt);
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
