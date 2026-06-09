import { appApi } from '@/services/appApi';
import { useCommunityEventStore } from '@/store/communityEventStore';
import type {
  CommunityEvent,
  CommunityEventComment,
  CommunityEventInput,
  CommunityEventPerson,
  CommunityEventPoll,
  CommunityEventPollOption,
  CommunityEventTimeProposal,
  CommunityEventTodo,
  EventResponse,
  EventRsvpStatus,
} from '@/types';

export interface LoadCommunityEventsOptions {
  includeDrafts?: boolean;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePerson(value: unknown): CommunityEventPerson {
  const person = value as Partial<CommunityEventPerson> | null | undefined;
  const uid = asNumber(person?.uid, 0);
  const name = asString(person?.name) || 'Ukjent';
  const avatarUpdatedAt = typeof person?.avatarUpdatedAt === 'number' ? person.avatarUpdatedAt : undefined;
  return { uid, name, ...(avatarUpdatedAt !== undefined ? { avatarUpdatedAt } : {}) };
}

function uniqueNumbers(values: unknown[]): number[] {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isFinite(value)))];
}

function normalizeResponse(value: unknown): EventResponse | null {
  const response = value as Partial<EventResponse> | null | undefined;
  const uid = asNumber(response?.uid, NaN);
  const name = asString(response?.name);
  const status = response?.status;
  if (!Number.isFinite(uid) || !name || status !== 'coming' && status !== 'maybe' && status !== 'cannot') {
    return null;
  }

  return {
    uid,
    name,
    status,
    respondedAt: asNumber(response?.respondedAt, Date.now()),
  };
}

function normalizeTimeProposal(value: unknown): CommunityEventTimeProposal | null {
  const proposal = value as Partial<CommunityEventTimeProposal> | null | undefined;
  const id = asString(proposal?.id);
  const label = asString(proposal?.label);
  const startsAt = asString(proposal?.startsAt);
  if (!id || !label || !startsAt || Number.isNaN(Date.parse(startsAt))) {
    return null;
  }

  return {
    id,
    label,
    startsAt: new Date(startsAt).toISOString(),
    votes: uniqueNumbers(Array.isArray(proposal?.votes) ? proposal.votes : []),
  };
}

function normalizePollOption(value: unknown): CommunityEventPollOption | null {
  const option = value as Partial<CommunityEventPollOption> | null | undefined;
  const id = asString(option?.id);
  const label = asString(option?.label);
  if (!id || !label) {
    return null;
  }

  return {
    id,
    label,
    votes: uniqueNumbers(Array.isArray(option?.votes) ? option.votes : []),
  };
}

function normalizePoll(value: unknown, author: CommunityEventPerson, createdAt: number): CommunityEventPoll | null {
  const poll = value as Partial<CommunityEventPoll> | null | undefined;
  const id = asString(poll?.id);
  const question = asString(poll?.question);
  if (!id || !question) {
    return null;
  }

  const options = (Array.isArray(poll?.options) ? poll.options : [])
    .map(normalizePollOption)
    .filter((option): option is CommunityEventPollOption => Boolean(option));

  return {
    id,
    question,
    allowMultiple: Boolean(poll?.allowMultiple),
    options,
    createdAt: asNumber(poll?.createdAt, createdAt),
    createdBy: normalizePerson(poll?.createdBy ?? author),
  };
}

function normalizeComment(value: unknown): CommunityEventComment | null {
  const comment = value as Partial<CommunityEventComment> | null | undefined;
  const id = asString(comment?.id);
  const author = normalizePerson(comment?.author);
  const createdAt = asNumber(comment?.createdAt, Date.now());
  const text = asString(comment?.text);
  if (!id || (!text && !comment?.poll)) {
    return null;
  }

  const poll = comment?.poll ? normalizePoll(comment.poll, author, createdAt) : undefined;
  if (!text && !poll) {
    return null;
  }

  return {
    id,
    author,
    ...(text ? { text } : {}),
    createdAt,
    ...(poll ? { poll } : {}),
  };
}

function normalizeTodo(value: unknown): CommunityEventTodo | null {
  const todo = value as Partial<CommunityEventTodo> | null | undefined;
  const id = asString(todo?.id);
  const title = asString(todo?.title);
  const mode = todo?.mode;
  if (!id || !title || mode !== 'open' && mode !== 'assigned' && mode !== 'claimable') {
    return null;
  }

  return {
    id,
    title,
    mode,
    ...(todo?.assignee ? { assignee: normalizePerson(todo.assignee) } : {}),
    ...(todo?.claimedBy ? { claimedBy: normalizePerson(todo.claimedBy) } : {}),
    ...(typeof todo?.completedAt === 'number' ? { completedAt: todo.completedAt } : {}),
    createdAt: asNumber(todo?.createdAt, Date.now()),
  };
}

function resolveStartsAt(event: Partial<CommunityEvent>, timeProposals: CommunityEventTimeProposal[], createdAt: number) {
  const rawStartsAt = asString(event.startsAt);
  if (event.timeMode === 'proposed') {
    if (timeProposals.length > 0) {
      return timeProposals[0].startsAt;
    }
    if (rawStartsAt && !Number.isNaN(Date.parse(rawStartsAt))) {
      return new Date(rawStartsAt).toISOString();
    }
    return new Date(createdAt + 60 * 60 * 1000).toISOString();
  }

  if (rawStartsAt && !Number.isNaN(Date.parse(rawStartsAt))) {
    return new Date(rawStartsAt).toISOString();
  }

  if (timeProposals.length > 0) {
    return timeProposals[0].startsAt;
  }

  return new Date(createdAt + 60 * 60 * 1000).toISOString();
}

export function normalizeCommunityEvent(event: unknown): CommunityEvent {
  const raw = event as Partial<CommunityEvent> | null | undefined;
  const createdAt = asNumber(raw?.createdAt, Date.now());
  const timeProposals = (Array.isArray(raw?.timeProposals) ? raw.timeProposals : [])
    .map(normalizeTimeProposal)
    .filter((proposal): proposal is CommunityEventTimeProposal => Boolean(proposal));
  const responses = (Array.isArray(raw?.responses) ? raw.responses : [])
    .map(normalizeResponse)
    .filter((response): response is EventResponse => Boolean(response));
  const comments = (Array.isArray(raw?.comments) ? raw.comments : [])
    .map(normalizeComment)
    .filter((comment): comment is CommunityEventComment => Boolean(comment));
  const todos = (Array.isArray(raw?.todos) ? raw.todos : [])
    .map(normalizeTodo)
    .filter((todo): todo is CommunityEventTodo => Boolean(todo));

  return {
    id: asString(raw?.id),
    title: asString(raw?.title),
    startsAt: resolveStartsAt(raw ?? {}, timeProposals, createdAt),
    location: asString(raw?.location) || undefined,
    description: asString(raw?.description) || undefined,
    createdAt,
    createdBy: normalizePerson(raw?.createdBy),
    responses,
    status: raw?.status === 'draft' ? 'draft' : 'published',
    updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : createdAt,
    publishedAt: typeof raw?.publishedAt === 'number' ? raw.publishedAt : undefined,
    imageUrl: asString(raw?.imageUrl) || undefined,
    eventType: asString(raw?.eventType) || undefined,
    customEventType: asString(raw?.customEventType) || undefined,
    timeMode: raw?.timeMode === 'proposed' ? 'proposed' : 'fixed',
    timeProposals,
    editMode: raw?.editMode === 'open' ? 'open' : 'locked',
    coOrganizers: (Array.isArray(raw?.coOrganizers) ? raw.coOrganizers : [])
      .map((person) => normalizePerson(person))
      .filter((person) => Boolean(person.uid || person.name)),
    comments,
    todos,
  };
}

function normalizeEventPayload<T extends CommunityEvent | CommunityEventInput>(input: T): Partial<CommunityEventInput> {
  const payload: Partial<CommunityEventInput> = {};

  if (input.title !== undefined) {
    payload.title = asString(input.title);
  }
  if (input.startsAt !== undefined) {
    const startsAt = asString(input.startsAt);
    if (startsAt) {
      payload.startsAt = new Date(startsAt).toISOString();
    }
  }
  if (input.location !== undefined) {
    payload.location = asString(input.location);
  }
  if (input.description !== undefined) {
    payload.description = asString(input.description);
  }
  if (input.imageUrl !== undefined) {
    payload.imageUrl = asString(input.imageUrl);
  }
  if (input.eventType !== undefined) {
    payload.eventType = asString(input.eventType);
  }
  if (input.customEventType !== undefined) {
    payload.customEventType = asString(input.customEventType);
  }
  if (input.timeMode !== undefined) {
    payload.timeMode = input.timeMode;
  }
  if (input.timeProposals !== undefined) {
    payload.timeProposals = input.timeProposals;
  }
  if (input.editMode !== undefined) {
    payload.editMode = input.editMode;
  }
  if (input.coOrganizers !== undefined) {
    payload.coOrganizers = input.coOrganizers;
  }
  if (input.comments !== undefined) {
    payload.comments = input.comments;
  }
  if (input.todos !== undefined) {
    payload.todos = input.todos;
  }
  if (input.responses !== undefined) {
    payload.responses = input.responses;
  }
  if (input.status !== undefined) {
    payload.status = input.status;
  }
  if (input.id !== undefined) {
    payload.id = input.id;
  }

  return payload;
}

export async function loadCommunityEvents(options: LoadCommunityEventsOptions = {}): Promise<CommunityEvent[]> {
  const query = new URLSearchParams();
  if (options.includeDrafts) {
    query.set('includeDrafts', 'true');
  }

  const path = `/community-events${query.toString() ? `?${query.toString()}` : ''}`;
  try {
    const events = await appApi.get<CommunityEvent[]>(path);
    const normalized = events.map(normalizeCommunityEvent);
    useCommunityEventStore.getState().setEvents(normalized);
    return normalized;
  } catch {
    useCommunityEventStore.getState().setEvents([]);
    return [];
  }
}

export async function loadCommunityEvent(eventId: string): Promise<CommunityEvent> {
  const event = await appApi.get<CommunityEvent>(`/community-events/${eventId}`);
  const normalized = normalizeCommunityEvent(event);
  useCommunityEventStore.getState().upsertEvent(normalized);
  return normalized;
}

export async function createCommunityEvent(input: CommunityEventInput): Promise<CommunityEvent> {
  const payload = normalizeEventPayload({
    ...input,
    status: 'published',
  } as CommunityEventInput);
  const event = await appApi.post<CommunityEvent>('/community-events', payload);
  const normalized = normalizeCommunityEvent(event);
  useCommunityEventStore.getState().upsertEvent(normalized);
  return normalized;
}

export async function saveCommunityEvent(eventId: string, input: Partial<CommunityEventInput>): Promise<CommunityEvent> {
  const payload = normalizeEventPayload(input as CommunityEventInput);
  const event = await appApi.put<CommunityEvent>(`/community-events/${eventId}`, payload);
  const normalized = normalizeCommunityEvent(event);
  useCommunityEventStore.getState().upsertEvent(normalized);
  return normalized;
}

export async function publishCommunityEvent(eventId: string, input: Partial<CommunityEventInput> = {}): Promise<CommunityEvent> {
  return saveCommunityEvent(eventId, {
    ...input,
    status: 'published',
  });
}

export async function deleteCommunityEvent(eventId: string): Promise<void> {
  await appApi.delete(`/community-events/${eventId}`);
  useCommunityEventStore.getState().removeEvent(eventId);
}

export async function respondToCommunityEvent(eventId: string, status: EventRsvpStatus): Promise<CommunityEvent> {
  const event = await appApi.post<CommunityEvent>(`/community-events/${eventId}/respond`, { status });
  const normalized = normalizeCommunityEvent(event);
  useCommunityEventStore.getState().upsertEvent(normalized);
  return normalized;
}
