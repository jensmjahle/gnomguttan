import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { nb } from 'date-fns/locale/nb';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import {
  deleteCommunityEvent,
  loadCommunityEvent,
  saveCommunityEvent,
} from '@/services/communityEvents';
import { loadAppUsers } from '@/services/users';
import { vocechatService } from '@/services/vocechat';
import { formatCommunityEventTimeRange } from '@/utils/communityEventTime';
import type {
  CommunityEvent,
  CommunityEventEditMode,
  CommunityEventInput,
  CommunityEventPerson,
  CommunityEventTimeMode,
  CommunityEventTimeProposal,
  CommunityEventTodo,
  CommunityEventStatus,
} from '@/types';
import styles from './CommunityEventEditorPage.module.css';

function generateId() {
  return globalThis.crypto?.randomUUID?.() ?? `evt_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function getDefaultDateTimeLocal() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}

function toDateTimeLocalValue(value: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (number: number) => String(number).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}

function fromDateTimeLocalValue(value: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function getPersonAvatar(person: CommunityEventPerson) {
  return person.avatarUpdatedAt !== undefined
    ? vocechatService.avatarUrl(person.uid, person.avatarUpdatedAt)
    : vocechatService.avatarUrl(person.uid);
}

function getEventTypeLabel(eventType: string, customEventType: string) {
  if (eventType === 'Egendefinert') {
    return customEventType.trim() || 'Egendefinert';
  }
  return eventType || 'Sosialt';
}

interface EditorState {
  id: string;
  title: string;
  imageUrl: string;
  location: string;
  description: string;
  eventType: string;
  customEventType: string;
  status: CommunityEventStatus;
  editMode: CommunityEventEditMode;
  timeMode: CommunityEventTimeMode;
  startsAt: string;
  endsAt: string;
  timeProposals: CommunityEventTimeProposal[];
  coOrganizers: CommunityEventPerson[];
  todos: CommunityEventTodo[];
}

function createBlankDraft(id: string): EditorState {
  return {
    id,
    title: '',
    imageUrl: '',
    location: '',
    description: '',
    eventType: 'Sosialt',
    customEventType: '',
    status: 'draft',
    editMode: 'locked',
    timeMode: 'fixed',
    startsAt: new Date(getDefaultDateTimeLocal()).toISOString(),
    endsAt: '',
    timeProposals: [],
    coOrganizers: [],
    todos: [],
  };
}

function draftFromEvent(event: CommunityEvent): EditorState {
  return {
    id: event.id,
    title: event.title ?? '',
    imageUrl: event.imageUrl ?? '',
    location: event.location ?? '',
    description: event.description ?? '',
    eventType: event.eventType ?? 'Sosialt',
    customEventType: event.customEventType ?? '',
    status: event.status ?? 'published',
    editMode: event.editMode ?? 'locked',
    timeMode: event.timeMode ?? 'fixed',
    startsAt: event.startsAt ?? new Date().toISOString(),
    endsAt: event.endsAt ?? '',
    timeProposals: event.timeProposals ?? [],
    coOrganizers: event.coOrganizers ?? [],
    todos: event.todos ?? [],
  };
}

function mergeDraft(base: EditorState, overlay: Partial<EditorState> | null | undefined): EditorState {
  if (!overlay) {
    return base;
  }

  return {
    ...base,
    ...overlay,
    id: overlay.id || base.id,
    timeProposals: Array.isArray(overlay.timeProposals) ? overlay.timeProposals : base.timeProposals,
    coOrganizers: Array.isArray(overlay.coOrganizers) ? overlay.coOrganizers : base.coOrganizers,
    todos: Array.isArray(overlay.todos) ? overlay.todos : base.todos,
  };
}

function buildSavePayload(draft: EditorState): Partial<CommunityEventInput> {
  const proposals = draft.timeProposals
    .map((proposal) => ({
      ...proposal,
      label: proposal.label.trim(),
      startsAt: proposal.startsAt.trim(),
    }))
    .filter((proposal) => proposal.label && proposal.startsAt && !Number.isNaN(Date.parse(proposal.startsAt)));

  const todos = draft.todos
    .map((todo) => ({
      ...todo,
      title: todo.title.trim(),
    }))
    .filter((todo) => todo.title.length > 0);

  return {
    title: draft.title.trim(),
    location: draft.location.trim() || undefined,
    description: draft.description.trim() || undefined,
    imageUrl: draft.imageUrl.trim() || undefined,
    eventType: draft.eventType,
    customEventType: draft.eventType === 'Egendefinert' ? draft.customEventType.trim() || undefined : undefined,
    status: draft.status,
    editMode: draft.editMode,
    timeMode: draft.timeMode,
    startsAt: draft.timeMode === 'proposed'
      ? proposals[0]?.startsAt || draft.startsAt
      : draft.startsAt,
    endsAt: draft.endsAt.trim() || undefined,
    timeProposals: proposals,
    coOrganizers: draft.coOrganizers,
    todos,
  };
}

function eventTimeLabel(event: EditorState) {
  const start = event.timeMode === 'proposed' && event.timeProposals[0]
    ? event.timeProposals[0].startsAt
    : event.startsAt;
  return formatCommunityEventTimeRange(start, event.endsAt || undefined, {
    locale: nb,
    startFormat: 'd. MMMM HH:mm',
  });
}

function useStorageKey(userId?: number, eventId?: string) {
  return useMemo(() => {
    if (!userId) {
      return '';
    }
    return `community-event-editor:${userId}:${eventId ?? 'new'}`;
  }, [eventId, userId]);
}

export function CommunityEventEditorPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const storageKey = useStorageKey(user?.uid, eventId);
  const [users, setUsers] = useState<CommunityEventPerson[]>([]);
  const [draft, setDraft] = useState<EditorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [busyAction, setBusyAction] = useState<'publish' | 'delete' | null>(null);
  const [newProposalLabel, setNewProposalLabel] = useState('');
  const [newProposalDateTime, setNewProposalDateTime] = useState(getDefaultDateTimeLocal());
  const [coOrganizerCandidate, setCoOrganizerCandidate] = useState('');
  const [todoTitle, setTodoTitle] = useState('');
  const [todoMode, setTodoMode] = useState<CommunityEventTodo['mode']>('open');
  const [todoAssigneeUid, setTodoAssigneeUid] = useState('');
  const [endTimeOpen, setEndTimeOpen] = useState(false);
  const lastSyncedRef = useRef('');
  const loadedOnServerRef = useRef(Boolean(eventId));

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError('');

      try {
        const loadedUsers = await loadAppUsers();
        let baseDraft = createBlankDraft(eventId ?? generateId());

        if (eventId) {
          const loadedEvent = await loadCommunityEvent(eventId);
          baseDraft = draftFromEvent(loadedEvent);
        }

        let nextDraft = baseDraft;
        if (storageKey) {
          const storedRaw = window.localStorage.getItem(storageKey);
          if (storedRaw) {
            try {
              const stored = JSON.parse(storedRaw) as Partial<EditorState>;
              nextDraft = mergeDraft(baseDraft, stored);
            } catch {
              // ignore invalid local drafts
            }
          }
        }

        if (!cancelled) {
          setUsers(loadedUsers);
          setDraft(nextDraft);
          setEndTimeOpen(Boolean(nextDraft.endsAt));
          lastSyncedRef.current = JSON.stringify(buildSavePayload(nextDraft));
          loadedOnServerRef.current = Boolean(eventId);
        }
      } catch {
        if (!cancelled) {
          setError('Kunne ikke laste arrangementet.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [eventId, storageKey]);

  const usersByUid = useMemo(
    () => new Map(users.map((person) => [person.uid, person] as const)),
    [users]
  );

  const candidateUsers = useMemo(
    () => users.filter((candidate) => !draft?.coOrganizers?.some((person) => person.uid === candidate.uid)),
    [draft?.coOrganizers, users]
  );

  useEffect(() => {
    if (!draft || !storageKey) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(draft));

    const payload = buildSavePayload(draft);
    const serialized = JSON.stringify(payload);
    if (serialized === lastSyncedRef.current) {
      setSaveState('saved');
      return;
    }

    const timer = setTimeout(() => {
      setSaveState('saving');
      void (async () => {
        try {
          const updated = await saveCommunityEvent(draft.id, payload);
          const nextDraft = draftFromEvent(updated);
          setDraft(nextDraft);
          lastSyncedRef.current = JSON.stringify(buildSavePayload(nextDraft));
          setSaveState('saved');
          loadedOnServerRef.current = true;
        } catch {
          setSaveState('error');
        }
      })();
    }, 700);

    return () => clearTimeout(timer);
  }, [draft, navigate, storageKey]);

  const currentPreview = draft ? {
    title: draft.title.trim() || 'Uten tittel',
    typeLabel: getEventTypeLabel(draft.eventType, draft.customEventType),
    timeLabel: eventTimeLabel(draft),
    location: draft.location.trim(),
    statusLabel: draft.status === 'draft' ? 'Kladd' : 'Publisert',
  } : null;

  async function handlePublish() {
    if (!draft) return;
    setBusyAction('publish');
    setError('');

    try {
      const payload = buildSavePayload({ ...draft, status: 'published' });
      const updated = await saveCommunityEvent(draft.id, {
        ...payload,
        status: 'published',
      });
      window.localStorage.removeItem(storageKey);
      navigate(`/arrangementer/${updated.id}`);
    } catch {
      setError('Kunne ikke publisere arrangementet. Sjekk at tittel og tidspunkt er fylt ut.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete() {
    if (!draft) return;
    setBusyAction('delete');
    setError('');

    try {
      if (loadedOnServerRef.current) {
        await deleteCommunityEvent(draft.id);
      }
      if (storageKey) {
        window.localStorage.removeItem(storageKey);
      }
      navigate('/calendar');
    } catch {
      setError('Kunne ikke slette arrangementet.');
    } finally {
      setBusyAction(null);
    }
  }

  function updateDraft(patch: Partial<EditorState>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        ...patch,
      };
    });
  }

  function addCoOrganizer() {
    if (!draft || !coOrganizerCandidate) return;
    const person = usersByUid.get(Number(coOrganizerCandidate));
    if (!person) return;
    if (draft.coOrganizers.some((existing) => existing.uid === person.uid)) return;
    updateDraft({ coOrganizers: [...draft.coOrganizers, person] });
    setCoOrganizerCandidate('');
  }

  function removeCoOrganizer(uid: number) {
    if (!draft) return;
    updateDraft({ coOrganizers: draft.coOrganizers.filter((person) => person.uid !== uid) });
  }

  function addProposal() {
    if (!draft) return;

    const label = newProposalLabel.trim();
    const startsAt = fromDateTimeLocalValue(newProposalDateTime);
    if (!label || !startsAt) {
      setError('Skriv et navn og velg tidspunkt for forslaget.');
      return;
    }

    const nextProposal: CommunityEventTimeProposal = {
      id: generateId(),
      label,
      startsAt,
      votes: [],
    };

    updateDraft({
      timeProposals: [...draft.timeProposals, nextProposal],
      startsAt: draft.timeMode === 'proposed' && draft.timeProposals.length === 0 ? startsAt : draft.startsAt,
    });
    setNewProposalLabel('');
    setNewProposalDateTime(getDefaultDateTimeLocal());
  }

  function updateProposal(id: string, patch: Partial<CommunityEventTimeProposal>) {
    if (!draft) return;
    const nextProposals = draft.timeProposals.map((proposal) =>
      proposal.id === id
        ? {
            ...proposal,
            ...patch,
          }
        : proposal
    );

    updateDraft({
      timeProposals: nextProposals,
      startsAt: draft.timeMode === 'proposed' && nextProposals[0] ? nextProposals[0].startsAt : draft.startsAt,
    });
  }

  function removeProposal(id: string) {
    if (!draft) return;
    const nextProposals = draft.timeProposals.filter((proposal) => proposal.id !== id);
    updateDraft({
      timeProposals: nextProposals,
      startsAt: draft.timeMode === 'proposed' && nextProposals[0] ? nextProposals[0].startsAt : draft.startsAt,
    });
  }

  function addTodo() {
    if (!draft) return;

    const title = todoTitle.trim();
    if (!title) {
      setError('Skriv en oppgave.');
      return;
    }

    const assignee = todoMode === 'assigned' && todoAssigneeUid ? usersByUid.get(Number(todoAssigneeUid)) ?? null : null;
    if (todoMode === 'assigned' && !assignee) {
      setError('Velg en person for den tildelte oppgaven.');
      return;
    }

    const nextTodo: CommunityEventTodo = {
      id: generateId(),
      title,
      mode: todoMode,
      ...(assignee ? { assignee } : {}),
      createdAt: Date.now(),
    };

    updateDraft({ todos: [...draft.todos, nextTodo] });
    setTodoTitle('');
    setTodoMode('open');
    setTodoAssigneeUid('');
  }

  function removeTodo(id: string) {
    if (!draft) return;
    updateDraft({ todos: draft.todos.filter((todo) => todo.id !== id) });
  }

  function toggleEndTime() {
    if (!draft) return;

    if (endTimeOpen) {
      setEndTimeOpen(false);
      return;
    }

    if (!draft.endsAt) {
      const start = new Date(draft.startsAt);
      const nextEnd = Number.isNaN(start.getTime())
        ? new Date(Date.now() + 2 * 60 * 60 * 1000)
        : new Date(start.getTime() + 60 * 60 * 1000);
      updateDraft({ endsAt: nextEnd.toISOString() });
    }

    setEndTimeOpen(true);
  }

  function clearEndTime() {
    if (!draft) return;
    updateDraft({ endsAt: '' });
    setEndTimeOpen(false);
  }

  async function handleImageFile(file: File | null) {
    if (!file || !draft) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateDraft({ imageUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  }

  if (loading) {
    return (
      <AppLayout>
        <div className={styles.page}>
          <div className={styles.loadingState}>Laster arrangement ...</div>
        </div>
      </AppLayout>
    );
  }

  if (!draft) {
    return (
      <AppLayout>
        <div className={styles.page}>
          <div className={styles.errorState}>
            <p className={styles.errorTitle}>Kunne ikke åpne editoren</p>
            <p className={styles.errorText}>{error || 'Prøv igjen.'}</p>
            <Link to="/calendar" className={styles.backLink}>Tilbake til kalender</Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className={styles.page}>
        <article className={styles.shell}>
          <header className={styles.header}>
            <div>
              <p className={styles.kicker}>{draft.status === 'draft' ? 'Kladd' : 'Arrangement'}</p>
              <h1 className={styles.title}>Rediger arrangement</h1>
            </div>
            <div className={styles.headerMeta}>
              <span className={styles.saveState}>
                {saveState === 'saving' ? 'Lagrer ...' : saveState === 'error' ? 'Lagring feilet' : 'Lagres automatisk'}
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/calendar')}>
                Tilbake
              </Button>
            </div>
          </header>

          <div className={styles.content}>
            <section className={styles.mainColumn}>
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Grunninfo</h2>
                </div>
                <div className={styles.sectionBody}>
                  <label className={styles.field}>
                    <span>Tittel</span>
                    <input
                      className={styles.input}
                      value={draft.title}
                      onChange={(event) => updateDraft({ title: event.target.value })}
                      placeholder="Sommerfest"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Bilde</span>
                    <div className={styles.imageInputRow}>
                      <input
                        className={styles.input}
                        value={draft.imageUrl}
                        onChange={(event) => updateDraft({ imageUrl: event.target.value })}
                        placeholder="Lim inn en bildeadresse eller bruk opplastet fil"
                      />
                      <label className={styles.fileButton}>
                        Last opp
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => void handleImageFile(event.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>
                  </label>

                  <label className={styles.field}>
                    <span>Sted</span>
                    <input
                      className={styles.input}
                      value={draft.location}
                      onChange={(event) => updateDraft({ location: event.target.value })}
                      placeholder="Kjelleren, parken eller lokalet"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Beskrivelse</span>
                    <textarea
                      className={styles.textarea}
                      value={draft.description}
                      onChange={(event) => updateDraft({ description: event.target.value })}
                      placeholder="Kort forklaring av arrangementet"
                    />
                  </label>
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Type og tilgang</h2>
                </div>
                <div className={styles.sectionBody}>
                  <div className={styles.inlineRow}>
                    <label className={styles.field}>
                      <span>Type</span>
                      <select className={styles.select} value={draft.eventType} onChange={(event) => updateDraft({ eventType: event.target.value })}>
                        <option value="Sosialt">Sosialt</option>
                        <option value="Fylla">Fylla</option>
                        <option value="Gaming">Gaming</option>
                        <option value="Skole">Skole</option>
                        <option value="Egendefinert">Egendefinert</option>
                      </select>
                    </label>

                    {draft.eventType === 'Egendefinert' && (
                      <label className={styles.field}>
                        <span>Egendefinert navn</span>
                        <input
                          className={styles.input}
                          value={draft.customEventType}
                          onChange={(event) => updateDraft({ customEventType: event.target.value })}
                          placeholder="Skriv eget navn"
                        />
                      </label>
                    )}
                  </div>

                  <div className={styles.inlineRow}>
                    <label className={styles.field}>
                      <span>Status</span>
                      <select className={styles.select} value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as CommunityEventStatus })}>
                        <option value="draft">Kladd</option>
                        <option value="published">Publisert</option>
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Redigering</span>
                      <select className={styles.select} value={draft.editMode} onChange={(event) => updateDraft({ editMode: event.target.value as CommunityEventEditMode })}>
                        <option value="locked">Låst</option>
                        <option value="open">Åpen</option>
                      </select>
                    </label>
                  </div>
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Tid</h2>
                </div>
                <div className={styles.sectionBody}>
                  <label className={styles.field}>
                    <span>Type tid</span>
                    <select className={styles.select} value={draft.timeMode} onChange={(event) => updateDraft({ timeMode: event.target.value as CommunityEventTimeMode })}>
                      <option value="fixed">Fast tidspunkt</option>
                      <option value="proposed">Forslått tidspunkt</option>
                    </select>
                  </label>

                  {draft.timeMode === 'fixed' ? (
                    <label className={styles.field}>
                      <span>Dato og tid</span>
                      <input
                        className={styles.input}
                        type="datetime-local"
                        value={toDateTimeLocalValue(draft.startsAt)}
                        onChange={(event) => updateDraft({ startsAt: fromDateTimeLocalValue(event.target.value) })}
                      />
                    </label>
                  ) : (
                    <div className={styles.proposalSection}>
                      <div className={styles.proposalList}>
                        {draft.timeProposals.map((proposal) => (
                          <div key={proposal.id} className={styles.proposalRow}>
                            <input
                              className={styles.input}
                              value={proposal.label}
                              onChange={(event) => updateProposal(proposal.id, { label: event.target.value })}
                              placeholder="Forslagsnavn"
                            />
                            <input
                              className={styles.input}
                              type="datetime-local"
                              value={toDateTimeLocalValue(proposal.startsAt)}
                              onChange={(event) => updateProposal(proposal.id, { startsAt: fromDateTimeLocalValue(event.target.value) })}
                            />
                            <div className={styles.rowActions}>
                              <span className={styles.voteCount}>{proposal.votes.length} stemmer</span>
                              <button type="button" className={styles.smallLink} onClick={() => removeProposal(proposal.id)}>
                                Fjern
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className={styles.inlineRow}>
                        <input
                          className={styles.input}
                          value={newProposalLabel}
                          onChange={(event) => setNewProposalLabel(event.target.value)}
                          placeholder="F.eks. 20.06 kl. 18"
                        />
                        <input
                          className={styles.input}
                          type="datetime-local"
                          value={newProposalDateTime}
                          onChange={(event) => setNewProposalDateTime(event.target.value)}
                        />
                        <Button type="button" size="sm" onClick={() => addProposal()}>
                          Legg til forslag
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className={styles.timeActions}>
                    <Button type="button" size="sm" variant="secondary" onClick={() => toggleEndTime()}>
                      {endTimeOpen
                        ? 'Skjul sluttidspunkt'
                        : draft.endsAt
                          ? 'Vis sluttidspunkt'
                          : 'Legg til sluttidspunkt'}
                    </Button>
                    {draft.endsAt && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => clearEndTime()}>
                        Fjern sluttidspunkt
                      </Button>
                    )}
                  </div>

                  {endTimeOpen && (
                    <label className={styles.field}>
                      <span>Sluttidspunkt</span>
                      <input
                        className={styles.input}
                        type="datetime-local"
                        value={toDateTimeLocalValue(draft.endsAt)}
                        onChange={(event) => updateDraft({ endsAt: fromDateTimeLocalValue(event.target.value) })}
                      />
                    </label>
                  )}
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Medarrangører</h2>
                </div>
                <div className={styles.sectionBody}>
                  <div className={styles.chipList}>
                    {draft.coOrganizers.map((person) => (
                      <span key={person.uid} className={styles.personChip}>
                        <Avatar src={getPersonAvatar(person)} name={person.name} size="sm" className={styles.personAvatar} />
                        <span>{person.name}</span>
                        <button type="button" className={styles.removeChip} onClick={() => removeCoOrganizer(person.uid)}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className={styles.inlineRow}>
                    <select className={styles.select} value={coOrganizerCandidate} onChange={(event) => setCoOrganizerCandidate(event.target.value)}>
                      <option value="">Velg person</option>
                      {candidateUsers.map((person) => (
                        <option key={person.uid} value={person.uid}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                    <Button type="button" size="sm" onClick={addCoOrganizer}>
                      Legg til
                    </Button>
                  </div>
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>To-dos</h2>
                </div>
                <div className={styles.sectionBody}>
                  <div className={styles.todoList}>
                    {draft.todos.map((todo) => {
                      const assignee = todo.assignee ? usersByUid.get(todo.assignee.uid) ?? todo.assignee : null;
                      return (
                        <div key={todo.id} className={styles.todoRow}>
                          <div className={styles.todoMain}>
                            <strong>{todo.title}</strong>
                            <span>
                              {todo.mode === 'open' ? 'Åpen for alle' : todo.mode === 'claimable' ? 'Kan claimes' : 'Tildelt'}
                              {assignee ? ` · ${assignee.name}` : ''}
                            </span>
                          </div>
                          <button type="button" className={styles.smallLink} onClick={() => removeTodo(todo.id)}>
                            Fjern
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className={styles.inlineRow}>
                    <input
                      className={styles.input}
                      value={todoTitle}
                      onChange={(event) => setTodoTitle(event.target.value)}
                      placeholder="Ny oppgave"
                    />
                    <select className={styles.select} value={todoMode} onChange={(event) => setTodoMode(event.target.value as CommunityEventTodo['mode'])}>
                      <option value="open">Åpen</option>
                      <option value="claimable">Kan claimes</option>
                      <option value="assigned">Tildelt</option>
                    </select>
                    {todoMode === 'assigned' && (
                      <select className={styles.select} value={todoAssigneeUid} onChange={(event) => setTodoAssigneeUid(event.target.value)}>
                        <option value="">Velg person</option>
                        {users.map((person) => (
                          <option key={person.uid} value={person.uid}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <Button type="button" size="sm" onClick={addTodo}>
                      Legg til
                    </Button>
                  </div>
                </div>
              </section>
            </section>

            <aside className={styles.sideColumn}>
              <section className={styles.previewCard}>
                <div className={styles.previewHeader}>
                  <h2 className={styles.previewTitle}>Forhåndsvisning</h2>
                  <span className={styles.previewStatus}>{currentPreview?.statusLabel}</span>
                </div>

                <div className={styles.previewImageWrap}>
                  {draft.imageUrl ? (
                    <img className={styles.previewImage} src={draft.imageUrl} alt="" />
                  ) : (
                    <div className={styles.previewFallback}>
                      <span>{currentPreview?.typeLabel ?? 'Sosialt'}</span>
                    </div>
                  )}
                </div>

                <div className={styles.previewBody}>
                  <h3 className={styles.previewEventTitle}>{currentPreview?.title ?? 'Uten tittel'}</h3>
                  <p className={styles.previewMeta}>
                    {currentPreview?.timeLabel}
                    {currentPreview?.location ? ` · ${currentPreview.location}` : ''}
                  </p>
                  <p className={styles.previewMeta}>{getEventTypeLabel(draft.eventType, draft.customEventType)}</p>
                  {draft.coOrganizers.length > 0 && (
                    <div className={styles.previewPeople}>
                      {draft.coOrganizers.map((person) => (
                        <Avatar key={person.uid} src={getPersonAvatar(person)} name={person.name} size="sm" />
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className={styles.actionCard}>
                <div className={styles.previewHeader}>
                  <h2 className={styles.previewTitle}>Handlinger</h2>
                </div>
                <div className={styles.actionList}>
                  <Button type="button" onClick={() => void handlePublish()} loading={busyAction === 'publish'}>
                    Publiser
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => void handleDelete()} loading={busyAction === 'delete'}>
                    Slett
                  </Button>
                </div>
                <p className={styles.hintText}>
                  Kladden lagres automatisk mens du skriver. Når du publiserer, blir arrangementet synlig for alle.
                </p>
              </section>
            </aside>
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}
        </article>
      </div>
    </AppLayout>
  );
}
