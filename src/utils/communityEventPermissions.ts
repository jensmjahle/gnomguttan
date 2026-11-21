import type { CommunityEvent } from '@/types';

/** Mirrors canUserEditCommunityEvent in server/index.js. */
export function canEditEvent(event: CommunityEvent | null | undefined, user?: { uid: number; isAdmin?: boolean } | null) {
  if (!event || !user) return false;
  if (user.isAdmin) return true;

  const isOwner = event.createdBy.uid === user.uid;
  const isCoOrganizer = (event.coOrganizers ?? []).some((person) => person.uid === user.uid);

  if (event.status === 'draft') {
    return isOwner || isCoOrganizer;
  }

  if (event.editMode === 'open') {
    return true;
  }

  return isOwner || isCoOrganizer;
}
