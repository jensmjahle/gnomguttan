import { appApi } from '@/services/appApi';
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
  const avatarUpdatedAt = typeof person?.avatarUpdatedAt === 'number' ? person.avatarUpdatedAt : undefined;
  return {
    uid: asNumber(person?.uid, 0),
    name: asString(person?.name) || 'Ukjent',
    ...(avatarUpdatedAt !== undefined ? { avatarUpdatedAt } : {}),
  };
}

function uniqueNumbers(values: unknown[]): number[] {
  return [...new Set(values.map(Number).filter(Number.isFinite))];
}

function normalizeResponse(value: unknown): EventResponse | null {
  const response = value as Partial<EventResponse> | null | undefined;
  const uid = asNumber(response?.uid, Number.NaN);
  const name = asString(response?.name);
  const status = response?.status;
  if (!Number.isFinite(uid) || !name || !['coming', 'maybe', 'cannot'].includes(status ?? '')) return null;
  return { uid, name, status: status as EventRsvpStatus, respondedAt: asNumber(response?.respondedAt, Date.now()) };
}

function normalizeProposal(value: unknown): CommunityEventTimeProposal | null {
  const proposal = value as Partial<CommunityEventTimeProposal> | null | undefined;
  const id = asString(proposal?.id);
  const label = asString(proposal?.label);
  const startsAt = asString(proposal?.startsAt);
  const endsAt = asString(proposal?.endsAt);
  if (!id || !startsAt || Number.isNaN(Date.parse(startsAt))) return null;
  return {
    id,
    label: label || new Date(startsAt).toLocaleString('nb-NO'),
    startsAt: new Date(startsAt).toISOString(),
    ...(endsAt && !Number.isNaN(Date.parse(endsAt)) ? { endsAt: new Date(endsAt).toISOString() } : {}),
    votes: uniqueNumbers(Array.isArray(proposal?.votes) ? proposal.votes : []),
  };
}

function normalizePollOption(value: unknown): CommunityEventPollOption | null {
  const option = value as Partial<CommunityEventPollOption> | null | undefined;
  const id = asString(option?.id);
  const label = asString(option?.label);
  if (!id || !label) return null;
  return { id, label, votes: uniqueNumbers(Array.isArray(option?.votes) ? option.votes : []) };
}

function normalizePoll(value: unknown, author: CommunityEventPerson, createdAt: number): CommunityEventPoll | null {
  const poll = value as Partial<CommunityEventPoll> | null | undefined;
  const id = asString(poll?.id);
  const question = asString(poll?.question);
  if (!id || !question) return null;
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
  const poll = comment?.poll ? normalizePoll(comment.poll, author, createdAt) : null;
  if (!id || (!text && !poll)) return null;
  return { id, author, createdAt, ...(text ? { text } : {}), ...(poll ? { poll } : {}) };
}

function normalizeTodo(value: unknown): CommunityEventTodo | null {
  const todo = value as Partial<CommunityEventTodo> | null | undefined;
  const id = asString(todo?.id);
  const title = asString(todo?.title);
  const mode = todo?.mode;
  if (!id || !title || !['open', 'assigned', 'claimable'].includes(mode ?? '')) return null;
  return {
    id,
    title,
    mode: mode as CommunityEventTodo['mode'],
    ...(todo?.assignee ? { assignee: normalizePerson(todo.assignee) } : {}),
    ...(todo?.claimedBy ? { claimedBy: normalizePerson(todo.claimedBy) } : {}),
    ...(typeof todo?.completedAt === 'number' ? { completedAt: todo.completedAt } : {}),
    createdAt: asNumber(todo?.createdAt, Date.now()),
  };
}

function resolveStartsAt(
  event: Partial<CommunityEvent>,
  proposals: CommunityEventTimeProposal[],
  createdAt: number,
): string {
  const raw = asString(event.startsAt);
  if (raw && !Number.isNaN(Date.parse(raw))) return new Date(raw).toISOString();
  if (proposals[0]) return proposals[0].startsAt;
  return new Date(createdAt + 60 * 60 * 1000).toISOString();
}

export function normalizeCommunityEvent(value: unknown): CommunityEvent {
  const raw = value as Partial<CommunityEvent> | null | undefined;
  const createdAt = asNumber(raw?.createdAt, Date.now());
  const proposals = (Array.isArray(raw?.timeProposals) ? raw.timeProposals : [])
    .map(normalizeProposal)
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
    startsAt: resolveStartsAt(raw ?? {}, proposals, createdAt),
    endsAt:
      typeof raw?.endsAt === 'string' && !Number.isNaN(Date.parse(raw.endsAt))
        ? new Date(raw.endsAt).toISOString()
        : undefined,
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
    timeProposals: proposals,
    timeProposalEditingEnabled: raw?.timeProposalEditingEnabled === true,
    editMode: raw?.editMode === 'open' ? 'open' : 'locked',
    coOrganizers: (Array.isArray(raw?.coOrganizers) ? raw.coOrganizers : []).map(normalizePerson),
    comments,
    todos,
    todoEditingEnabled: raw?.todoEditingEnabled === true,
  };
}

function normalizePayload(input: Partial<CommunityEventInput>): Partial<CommunityEventInput> {
  const payload: Partial<CommunityEventInput> = { ...input };
  if (input.title !== undefined) payload.title = asString(input.title);
  if (input.location !== undefined) payload.location = asString(input.location) || undefined;
  if (input.description !== undefined) payload.description = asString(input.description) || undefined;
  if (input.imageUrl !== undefined) payload.imageUrl = asString(input.imageUrl) || undefined;
  if (input.customEventType !== undefined) payload.customEventType = asString(input.customEventType) || undefined;
  if (input.startsAt !== undefined) {
    const startsAt = asString(input.startsAt);
    payload.startsAt = startsAt && !Number.isNaN(Date.parse(startsAt)) ? new Date(startsAt).toISOString() : undefined;
  }
  if (input.endsAt !== undefined) {
    const endsAt = asString(input.endsAt);
    payload.endsAt = endsAt && !Number.isNaN(Date.parse(endsAt)) ? new Date(endsAt).toISOString() : undefined;
  }
  return payload;
}

export async function loadCommunityEvents(options: LoadCommunityEventsOptions = {}): Promise<CommunityEvent[]> {
  const query = options.includeDrafts ? '?includeDrafts=true' : '';
  const events = await appApi.get<CommunityEvent[]>(`/community-events${query}`);
  return events.map(normalizeCommunityEvent);
}

export async function loadCommunityEvent(eventId: string): Promise<CommunityEvent> {
  return normalizeCommunityEvent(await appApi.get<CommunityEvent>(`/community-events/${eventId}`));
}

export async function createCommunityEvent(input: CommunityEventInput): Promise<CommunityEvent> {
  const payload = normalizePayload({ ...input, status: input.status ?? 'published' });
  return normalizeCommunityEvent(await appApi.post<CommunityEvent>('/community-events', payload));
}

export async function saveCommunityEvent(
  eventId: string,
  input: Partial<CommunityEventInput>,
): Promise<CommunityEvent> {
  return normalizeCommunityEvent(
    await appApi.put<CommunityEvent>(`/community-events/${eventId}`, normalizePayload(input)),
  );
}

export async function deleteCommunityEvent(eventId: string): Promise<void> {
  await appApi.delete(`/community-events/${eventId}`);
}

export async function respondToCommunityEvent(
  eventId: string,
  status: EventRsvpStatus,
): Promise<CommunityEvent> {
  return normalizeCommunityEvent(
    await appApi.post<CommunityEvent>(`/community-events/${eventId}/respond`, { status }),
  );
}
