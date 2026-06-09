import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale/nb';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import {
  loadCommunityEvent,
  respondToCommunityEvent,
  saveCommunityEvent,
} from '@/services/communityEvents';
import { loadAppUsers } from '@/services/users';
import { vocechatService } from '@/services/vocechat';
import type {
  CommunityEvent,
  CommunityEventComment,
  CommunityEventPerson,
  CommunityEventTodo,
  EventRsvpStatus,
  CommunityEventTimeProposal,
} from '@/types';
import styles from './CommunityEventDetailPage.module.css';

const RSVP_OPTIONS: Array<{ value: EventRsvpStatus; label: string }> = [
  { value: 'coming', label: 'Kommer' },
  { value: 'maybe', label: 'Kanskje' },
  { value: 'cannot', label: 'Kan ikke' },
];

const EVENT_TYPES: Record<string, string> = {
  Sosialt: 'Sosialt',
  Fylla: 'Fylla',
  Gaming: 'Gaming',
  Skole: 'Skole',
  Egendefinert: 'Egendefinert',
};

function generateId() {
  return globalThis.crypto?.randomUUID?.() ?? `evt_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function getEventTitle(event: CommunityEvent) {
  return event.title.trim() || 'Uten tittel';
}

function getEventTypeLabel(event: CommunityEvent) {
  const type = event.eventType?.trim() || 'Sosialt';
  if (type === 'Egendefinert') {
    return event.customEventType?.trim() || 'Egendefinert';
  }
  return EVENT_TYPES[type] ?? type;
}

function getEventStatusLabel(event: CommunityEvent) {
  return event.status === 'draft' ? 'Kladd' : 'Publisert';
}

function getPersonAvatar(person: CommunityEventPerson) {
  return person.avatarUpdatedAt !== undefined
    ? vocechatService.avatarUrl(person.uid, person.avatarUpdatedAt)
    : vocechatService.avatarUrl(person.uid);
}

function formatDateTime(value: string) {
  return format(new Date(value), 'd. MMMM yyyy HH:mm', { locale: nb });
}

function formatShortDate(value: string) {
  return format(new Date(value), 'd. MMM HH:mm', { locale: nb });
}

function normalizeAssignee(users: CommunityEventPerson[], uid: number) {
  return users.find((user) => user.uid === uid) ?? null;
}

function cloneVotes(votes: number[], uid: number, allowMultiple: boolean) {
  if (allowMultiple) {
    const hasVote = votes.includes(uid);
    return hasVote ? votes.filter((vote) => vote !== uid) : [...votes, uid];
  }

  const currentlyVoted = votes.includes(uid);
  if (currentlyVoted) {
    return [];
  }

  return [uid];
}

function canEditEvent(event: CommunityEvent | null, user?: { uid: number; isAdmin?: boolean } | null) {
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

function resolvePerson(person: CommunityEventPerson, usersByUid: Map<number, CommunityEventPerson>) {
  return usersByUid.get(person.uid) ?? person;
}

function EventPersonChip({
  person,
  usersByUid,
}: {
  person: CommunityEventPerson;
  usersByUid: Map<number, CommunityEventPerson>;
}) {
  const resolved = resolvePerson(person, usersByUid);

  return (
    <span className={styles.personChip} title={resolved.name}>
      <Avatar
        src={getPersonAvatar(resolved)}
        name={resolved.name}
        size="sm"
        className={styles.personAvatar}
      />
      <span>{resolved.name}</span>
    </span>
  );
}

export function CommunityEventDetailPage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [event, setEvent] = useState<CommunityEvent | null>(null);
  const [users, setUsers] = useState<CommunityEventPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [todoTitle, setTodoTitle] = useState('');
  const [todoMode, setTodoMode] = useState<CommunityEventTodo['mode']>('open');
  const [todoAssigneeUid, setTodoAssigneeUid] = useState('');
  const [todoComposerOpen, setTodoComposerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError('');

      try {
        const [loadedEvent, loadedUsers] = await Promise.all([
          loadCommunityEvent(eventId),
          loadAppUsers(),
        ]);

        if (!cancelled) {
          setEvent(loadedEvent);
          setUsers(loadedUsers);
        }
      } catch {
        if (!cancelled) {
          setError('Fant ikke arrangementet.');
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
  }, [eventId]);

  const usersByUid = useMemo(
    () => new Map(users.map((person) => [person.uid, person] as const)),
    [users]
  );

  const currentUserPerson = useMemo<CommunityEventPerson | null>(() => {
    if (!user) return null;
    return {
      uid: user.uid,
      name: user.name,
      ...(user.avatarUpdatedAt !== undefined ? { avatarUpdatedAt: user.avatarUpdatedAt } : {}),
    };
  }, [user]);

  const canEdit = canEditEvent(event, user);
  const isDraft = event?.status === 'draft';
  const responseCounts = useMemo(() => {
    if (!event) {
      return { coming: 0, maybe: 0, cannot: 0 };
    }

    return {
      coming: event.responses.filter((response) => response.status === 'coming').length,
      maybe: event.responses.filter((response) => response.status === 'maybe').length,
      cannot: event.responses.filter((response) => response.status === 'cannot').length,
    };
  }, [event]);

  const nonResponders = useMemo(() => {
    if (!event) return [];
    const responded = new Set(event.responses.map((response) => response.uid));
    return users.filter((candidate) => !responded.has(candidate.uid));
  }, [event, users]);

  const timeProposals = event?.timeProposals ?? [];
  const comments = event?.comments ?? [];
  const todos = event?.todos ?? [];
  const todoEditingEnabled = event?.todoEditingEnabled !== false;
  const canManageTodos = canEdit && todoEditingEnabled;
  const participantResponses = event?.responses ?? [];
  const myResponse = participantResponses.find((response) => response.uid === user?.uid) ?? null;

  const participantsByStatus = useMemo(() => {
    const groups = {
      coming: [] as CommunityEventPerson[],
      maybe: [] as CommunityEventPerson[],
      cannot: [] as CommunityEventPerson[],
    };

    if (!event) {
      return groups;
    }

    for (const response of event.responses) {
      const person = usersByUid.get(response.uid) ?? { uid: response.uid, name: response.name };
      groups[response.status].push(person);
    }

    return groups;
  }, [event, usersByUid]);

  async function persistEvent(patch: Partial<CommunityEvent>) {
    if (!event) return null;
    setBusyAction('save');
    setError('');
    try {
      const updated = await saveCommunityEvent(event.id, patch);
      setEvent(updated);
      return updated;
    } catch {
      setError('Kunne ikke lagre endringen.');
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRespond(status: EventRsvpStatus) {
    if (!event || !user) return;
    setBusyAction(`respond:${status}`);
    setError('');
    try {
      const updated = await respondToCommunityEvent(event.id, status);
      setEvent(updated);
    } catch {
      setError('Kunne ikke oppdatere svaret.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePublish() {
    if (!event) return;
    await persistEvent({ status: 'published' });
  }

  async function handleSetFinalTime(proposal: CommunityEventTimeProposal) {
    if (!event) return;
    await persistEvent({
      timeMode: 'fixed',
      startsAt: proposal.startsAt,
    });
  }

  async function handleVoteProposal(proposalId: string) {
    if (!event || !user) return;
    const nextProposals = timeProposals.map((proposal) => {
      if (proposal.id !== proposalId) {
        return proposal;
      }

      const votes = proposal.votes.includes(user.uid)
        ? proposal.votes.filter((vote) => vote !== user.uid)
        : [...proposal.votes, user.uid];

      return { ...proposal, votes };
    });

    await persistEvent({ timeProposals: nextProposals });
  }

  async function handleVotePoll(commentId: string, optionId: string) {
    if (!event || !user) return;

    const nextComments = comments.map((comment) => {
      const poll = comment.poll;
      if (comment.id !== commentId || !poll) {
        return comment;
      }

      const nextOptions = poll.options.map((option) => {
        if (option.id !== optionId) {
          if (!poll.allowMultiple) {
            return {
              ...option,
              votes: option.votes.filter((vote) => vote !== user.uid),
            };
          }
          return option;
        }

        const nextVotes = cloneVotes(option.votes, user.uid, Boolean(poll.allowMultiple));
        return {
          ...option,
          votes: nextVotes,
        };
      });

      return {
        ...comment,
        poll: {
          ...poll,
          options: nextOptions,
        },
      };
    });

    await persistEvent({ comments: nextComments });
  }

  async function handleAddComment() {
    if (!event || !user) return;

    const text = commentText.trim();
    const question = pollQuestion.trim();
    const options = pollOptions.map((option) => option.trim()).filter(Boolean);

    if (!text && !question) {
      setError('Skriv en kommentar eller et avstemningsspørsmål.');
      return;
    }

    const author = currentUserPerson ?? { uid: user.uid, name: user.name };
    const newComment: CommunityEventComment = {
      id: generateId(),
      author,
      createdAt: Date.now(),
      ...(text ? { text } : {}),
    };

    if (question) {
      if (options.length < 2) {
        setError('En avstemning må ha minst to alternativer.');
        return;
      }

      newComment.poll = {
        id: generateId(),
        question,
        allowMultiple: pollAllowMultiple,
        options: options.map((label) => ({
          id: generateId(),
          label,
          votes: [],
        })),
        createdAt: Date.now(),
        createdBy: author,
      };
    }

    await persistEvent({
      comments: [...comments, newComment],
    });

    setCommentText('');
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollAllowMultiple(false);
  }

  async function handleAddTodo() {
    if (!event || !canManageTodos) return;

    const title = todoTitle.trim();
    if (!title) {
      setError('Skriv en oppgave.');
      return;
    }

    const assignee =
      todoMode === 'assigned' && todoAssigneeUid
        ? normalizeAssignee(users, Number(todoAssigneeUid))
        : null;

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

    await persistEvent({ todos: [...todos, nextTodo] });
    setTodoTitle('');
    setTodoMode('open');
    setTodoAssigneeUid('');
  }

  async function handleClaimTodo(todoId: string) {
    if (!event || !currentUserPerson) return;

    const nextTodos = todos.map((todo) => {
      if (todo.id !== todoId || todo.mode !== 'claimable' || todo.claimedBy) {
        return todo;
      }

      return {
        ...todo,
        claimedBy: currentUserPerson,
      };
    });

    await persistEvent({ todos: nextTodos });
  }

  async function handleRemoveTodo(todoId: string) {
    if (!event || !canManageTodos) return;
    await persistEvent({ todos: todos.filter((todo) => todo.id !== todoId) });
  }

  async function handleToggleTodoEditing() {
    if (!event) return;
    await persistEvent({ todoEditingEnabled: !todoEditingEnabled });
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

  if (!event) {
    return (
      <AppLayout>
        <div className={styles.page}>
          <div className={styles.errorState}>
            <p className={styles.errorTitle}>Fant ikke arrangementet</p>
            <p className={styles.errorText}>{error || 'Det kan ha blitt slettet eller du mangler tilgang.'}</p>
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
          <header className={styles.hero}>
            {event.imageUrl ? (
              <img className={styles.heroImage} src={event.imageUrl} alt="" />
            ) : (
              <div className={styles.heroFallback}>
                <span>{getEventTypeLabel(event)}</span>
              </div>
            )}
            <div className={styles.heroOverlay} />
            <div className={styles.heroContent}>
              <div className={styles.heroTopRow}>
                <div className={styles.heroBadges}>
                  <span className={styles.typeBadge}>{getEventTypeLabel(event)}</span>
                  {isDraft && <span className={styles.statusBadgeDraft}>{getEventStatusLabel(event)}</span>}
                  {event.timeMode === 'proposed' && <span className={styles.statusBadgeMuted}>Tid foreslås</span>}
                </div>

                {canEdit && (
                  <div className={styles.headerActions}>
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/arrangementer/${event.id}/rediger`)}>
                      Rediger
                    </Button>
                    {isDraft && (
                      <Button size="sm" onClick={() => void handlePublish()} loading={busyAction === 'save'}>
                        Publiser
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <h1 className={styles.title}>{getEventTitle(event)}</h1>
              <div className={styles.subtitleRow}>
                <span>{formatDateTime(event.startsAt)}</span>
                {event.location && <span>{event.location}</span>}
                <span>{participantResponses.length} svar</span>
              </div>
            </div>
          </header>

          <div className={styles.content}>
            <section className={styles.mainColumn}>
              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Beskrivelse</h2>
                </div>
                <div className={styles.cardBody}>
                  {event.description ? (
                    <p className={styles.description}>{event.description}</p>
                  ) : (
                    <p className={styles.emptyText}>Ingen beskrivelse er lagt inn enda.</p>
                  )}
                </div>
              </section>

              {event.timeMode !== 'fixed' && (
                <section className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>Tidspunkter</h2>
                  </div>
                  <div className={styles.cardBody}>
                    {timeProposals.length === 0 ? (
                      <p className={styles.emptyText}>Det er ikke lagt inn tidspunktsforslag enda.</p>
                    ) : (
                      <div className={styles.proposalList}>
                        {timeProposals.map((proposal) => {
                          const myVote = proposal.votes.includes(user?.uid ?? -1);
                          return (
                            <div key={proposal.id} className={styles.proposalRow}>
                              <div className={styles.proposalInfo}>
                                <strong>{proposal.label}</strong>
                                <span>{proposal.votes.length} kan</span>
                                <span>{formatShortDate(proposal.startsAt)}</span>
                              </div>
                              <div className={styles.proposalActions}>
                                <button
                                  type="button"
                                  className={[styles.smallBtn, myVote ? styles.smallBtnActive : ''].filter(Boolean).join(' ')}
                                  onClick={() => void handleVoteProposal(proposal.id)}
                                  disabled={!user || busyAction === 'save'}
                                >
                                  {myVote ? 'Stemt' : 'Stem'}
                                </button>
                                {canEdit && (
                                  <button
                                    type="button"
                                    className={styles.smallBtn}
                                    onClick={() => void handleSetFinalTime(proposal)}
                                    disabled={busyAction === 'save'}
                                  >
                                    Fastsett
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>To-dos</h2>
                  {canEdit && (
                    <div className={styles.todoHeaderActions}>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleToggleTodoEditing()}
                        disabled={busyAction === 'save'}
                        aria-pressed={todoEditingEnabled}
                      >
                        {todoEditingEnabled ? 'Redigering: på' : 'Redigering: av'}
                      </Button>
                    </div>
                  )}
                </div>
                <div className={styles.cardBody}>
                  {todos.length === 0 ? (
                    <p className={styles.emptyText}>Ingen oppgaver er lagt til ennå.</p>
                  ) : (
                    <div className={styles.todoList}>
                      {todos.map((todo) => {
                        const claimedBy = todo.claimedBy ? resolvePerson(todo.claimedBy, usersByUid) : null;
                        const assignee = todo.assignee ? resolvePerson(todo.assignee, usersByUid) : null;
                        const badgeLabel =
                          todo.mode === 'open'
                            ? 'Alle'
                            : todo.mode === 'assigned'
                              ? 'Tildelt'
                              : claimedBy
                                ? `${claimedBy.name} fikser!`
                                : 'Hvem fikser?';
                        const badgeClass =
                          todo.mode === 'open'
                            ? styles.todoBadgeOpen
                            : todo.mode === 'assigned'
                              ? styles.todoBadgeAssigned
                              : claimedBy
                                ? styles.todoBadgeSuccess
                                : styles.todoBadgeWarning;
                        return (
                          <div key={todo.id} className={styles.todoRow}>
                            <div className={styles.todoMain}>
                              <div className={styles.todoTitleRow}>
                                <span className={styles.todoTitle}>{todo.title}</span>
                                <span className={[styles.todoBadge, badgeClass].filter(Boolean).join(' ')}>
                                  {badgeLabel}
                                </span>
                              </div>
                              <div className={styles.todoMeta}>
                                {todo.mode === 'assigned' && assignee && <span>Tildelt {assignee.name}</span>}
                              </div>
                            </div>
                            <div className={styles.todoActions}>
                              {todo.mode === 'claimable' && !todo.claimedBy && (
                                <button
                                  type="button"
                                  className={styles.smallBtn}
                                  onClick={() => void handleClaimTodo(todo.id)}
                                  disabled={!user || busyAction === 'save'}
                                >
                                  Ta oppgaven
                                </button>
                              )}
                              {canManageTodos && (
                                <button
                                  type="button"
                                  className={styles.smallBtnDanger}
                                  onClick={() => void handleRemoveTodo(todo.id)}
                                  disabled={busyAction === 'save'}
                                >
                                  Slett
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {canEdit && !todoEditingEnabled && (
                    <p className={styles.todoLockedNote}>Oppgaver er låst av arrangøren.</p>
                  )}

                  {canManageTodos && !todoComposerOpen && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setTodoComposerOpen(true)}
                    >
                      Legg til oppgave
                    </Button>
                  )}

                  {canManageTodos && todoComposerOpen && (
                    <div className={styles.todoComposer}>
                      <div className={styles.todoComposerRow}>
                        <input
                          className={styles.input}
                          value={todoTitle}
                          onChange={(event) => setTodoTitle(event.target.value)}
                          placeholder="Skriv en oppgave"
                        />
                        <select
                          className={styles.select}
                          value={todoMode}
                          onChange={(event) => setTodoMode(event.target.value as CommunityEventTodo['mode'])}
                        >
                          <option value="open">Alle</option>
                          <option value="assigned">Tildelt</option>
                          <option value="claimable">Hvem fikser?</option>
                        </select>
                      </div>

                      {todoMode === 'assigned' && (
                        <select
                          className={styles.select}
                          value={todoAssigneeUid}
                          onChange={(event) => setTodoAssigneeUid(event.target.value)}
                        >
                          <option value="">Velg person</option>
                          {users.map((candidate) => (
                            <option key={candidate.uid} value={candidate.uid}>
                              {candidate.name}
                            </option>
                          ))}
                        </select>
                      )}

                      <div className={styles.todoComposerActions}>
                        <Button type="button" size="sm" onClick={() => void handleAddTodo()} loading={busyAction === 'save'}>
                          Legg til
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setTodoComposerOpen(false)}
                          disabled={busyAction === 'save'}
                        >
                          Skjul
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Kommentarer</h2>
                  <span className={styles.cardHint}>{comments.length} innlegg</span>
                </div>
                <div className={styles.cardBody}>
                  {comments.length === 0 ? (
                    <p className={styles.emptyText}>Ingen kommentarer enda.</p>
                  ) : (
                    <div className={styles.commentList}>
                      {comments.map((comment) => {
                        const resolvedAuthor = resolvePerson(comment.author, usersByUid);
                        const poll = comment.poll ?? null;
                        return (
                          <article key={comment.id} className={styles.commentRow}>
                            <Avatar
                              src={getPersonAvatar(resolvedAuthor)}
                              name={resolvedAuthor.name}
                              size="md"
                              className={styles.commentAvatar}
                            />
                            <div className={styles.commentContent}>
                              <div className={styles.commentHeaderRow}>
                                <strong>{resolvedAuthor.name}</strong>
                                <span>{format(new Date(comment.createdAt), 'd. MMM HH:mm', { locale: nb })}</span>
                              </div>
                              {comment.text && <p className={styles.commentText}>{comment.text}</p>}

                              {poll && (
                                <div className={styles.pollBox}>
                                  <div className={styles.pollHeader}>
                                    <strong>{poll.question}</strong>
                                    <span>{poll.allowMultiple ? 'Flervalg' : 'Ett valg'}</span>
                                  </div>
                                  <div className={styles.pollOptions}>
                                    {poll.options.map((option) => {
                                      const myVote = option.votes.includes(user?.uid ?? -1);
                                      return (
                                        <button
                                          key={option.id}
                                          type="button"
                                          className={[styles.pollOption, myVote ? styles.pollOptionActive : ''].filter(Boolean).join(' ')}
                                          onClick={() => void handleVotePoll(comment.id, option.id)}
                                          disabled={!user || busyAction === 'save'}
                                        >
                                          <span>{option.label}</span>
                                          <strong>{option.votes.length}</strong>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {event.status === 'published' && (
                    <div className={styles.commentComposer}>
                      <textarea
                        className={styles.textarea}
                        rows={4}
                        value={commentText}
                        onChange={(event) => setCommentText(event.target.value)}
                        placeholder="Skriv en kommentar ..."
                      />

                      <div className={styles.pollComposer}>
                        <div className={styles.inlineRow}>
                          <input
                            className={styles.input}
                            value={pollQuestion}
                            onChange={(event) => setPollQuestion(event.target.value)}
                            placeholder="Lag avstemning (valgfritt)"
                          />
                          <label className={styles.checkboxRow}>
                            <input
                              type="checkbox"
                              checked={pollAllowMultiple}
                              onChange={(event) => setPollAllowMultiple(event.target.checked)}
                            />
                            <span>Flervalg</span>
                          </label>
                        </div>
                        <div className={styles.pollOptionEditor}>
                          {pollOptions.map((value, index) => (
                            <input
                              key={index}
                              className={styles.input}
                              value={value}
                              onChange={(event) => {
                                const next = [...pollOptions];
                                next[index] = event.target.value;
                                setPollOptions(next);
                              }}
                              placeholder={`Alternativ ${index + 1}`}
                            />
                          ))}
                        </div>
                        <div className={styles.inlineRow}>
                          <Button type="button" size="sm" onClick={() => setPollOptions((next) => [...next, ''])}>
                            + Alternativ
                          </Button>
                          <Button type="button" size="sm" onClick={() => void handleAddComment()} loading={busyAction === 'save'}>
                            Legg til kommentar
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </section>

            <aside className={styles.sidebar}>
              <section className={styles.sideCard}>
                <div className={styles.sideCardHeader}>
                  <h2 className={styles.sideTitle}>Tid og sted</h2>
                </div>
                <div className={styles.sideCardBody}>
                  <div className={styles.infoLine}>
                    <span>Dato</span>
                    <strong>{formatDateTime(event.startsAt)}</strong>
                  </div>
                  {event.location && (
                    <div className={styles.infoLine}>
                      <span>Sted</span>
                      <strong>{event.location}</strong>
                    </div>
                  )}
                  <div className={styles.infoLine}>
                    <span>Status</span>
                    <strong>{getEventStatusLabel(event)}</strong>
                  </div>
                </div>
              </section>

              <section className={styles.sideCard}>
                <div className={styles.sideCardHeader}>
                  <h2 className={styles.sideTitle}>Påmelding</h2>
                </div>
                <div className={styles.sideCardBody}>
                  <div className={styles.rsvpCounts}>
                    <span>{responseCounts.coming} kommer</span>
                    <span>{responseCounts.maybe} kanskje</span>
                    <span>{responseCounts.cannot} kan ikke</span>
                  </div>
                  <div className={styles.responseButtons}>
                    {RSVP_OPTIONS.map((option) => {
                      const active = myResponse?.status === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={[styles.rsvpAction, active ? styles.rsvpActionActive : ''].filter(Boolean).join(' ')}
                          onClick={() => void handleRespond(option.value)}
                          disabled={!user || busyAction === `respond:${option.value}`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className={styles.sideDivider} />
                  <div className={styles.participantGroups}>
                    {RSVP_OPTIONS.map((option) => (
                      <div key={option.value} className={styles.participantGroup}>
                        <div className={styles.participantGroupTitle}>
                          {option.label} <span>({participantsByStatus[option.value].length})</span>
                        </div>
                        <div className={styles.participantList}>
                          {participantsByStatus[option.value].length === 0 ? (
                            <span className={styles.emptyTiny}>Ingen</span>
                          ) : (
                            participantsByStatus[option.value].map((person) => (
                              <EventPersonChip key={person.uid} person={person} usersByUid={usersByUid} />
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                    <div className={styles.participantGroup}>
                      <div className={styles.participantGroupTitle}>
                        Ikke svart <span>({nonResponders.length})</span>
                      </div>
                      <div className={styles.participantList}>
                        {nonResponders.length === 0 ? (
                          <span className={styles.emptyTiny}>Alle har svart</span>
                        ) : (
                          nonResponders.map((person) => (
                            <EventPersonChip key={person.uid} person={person} usersByUid={usersByUid} />
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className={styles.sideCard}>
                <div className={styles.sideCardHeader}>
                  <h2 className={styles.sideTitle}>Arrangør</h2>
                </div>
                <div className={styles.sideCardBody}>
                  <div className={styles.organizerRow}>
                    <EventPersonChip person={event.createdBy} usersByUid={usersByUid} />
                  </div>
                  <div className={styles.infoLine}>
                    <span>Redigering</span>
                    <strong>{event.editMode === 'open' ? 'Åpen' : 'Låst'}</strong>
                  </div>
                  {(event.coOrganizers ?? []).length > 0 && (
                    <>
                      <div className={styles.sideDivider} />
                      <div className={styles.coOrganizerList}>
                        {(event.coOrganizers ?? []).map((person) => (
                          <EventPersonChip key={person.uid} person={person} usersByUid={usersByUid} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </section>

            </aside>
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}
        </article>
      </div>
    </AppLayout>
  );
}
