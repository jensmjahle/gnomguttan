import { FormEvent, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useCommunityEventStore } from '@/store/communityEventStore';
import type { CommunityEvent, EventRsvpStatus, EventResponse } from '@/types';
import styles from './EventsWidget.module.css';

const RSVP_OPTIONS: Array<{ value: EventRsvpStatus; label: string }> = [
  { value: 'coming', label: 'Kommer' },
  { value: 'maybe', label: 'Kanskje' },
  { value: 'cannot', label: 'Kan ikke' },
];

const RSVP_STATUS_LABELS: Record<EventRsvpStatus, string> = {
  coming: 'kommer',
  maybe: 'kanskje',
  cannot: 'kan ikke',
};

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function toDateTimeLocalValue(date: Date) {
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

function getDefaultStartsAt() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return toDateTimeLocalValue(date);
}

function formatDateTime(value: string) {
  return format(new Date(value), 'dd.MM.yyyy HH:mm');
}

function groupResponses(responses: EventResponse[]) {
  const grouped: Record<EventRsvpStatus, EventResponse[]> = {
    coming: [],
    maybe: [],
    cannot: [],
  };

  for (const response of responses) {
    grouped[response.status].push(response);
  }

  for (const status of RSVP_OPTIONS.map((option) => option.value)) {
    grouped[status].sort((left, right) => left.name.localeCompare(right.name, 'nb'));
  }

  return grouped;
}

function getResponseCount(event: CommunityEvent, status: EventRsvpStatus) {
  return event.responses.filter((response) => response.status === status).length;
}

export function EventsWidget() {
  const { user } = useAuth();
  const events = useCommunityEventStore((state) => state.events);
  const createEvent = useCommunityEventStore((state) => state.createEvent);
  const respondToEvent = useCommunityEventStore((state) => state.respondToEvent);

  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftStartsAt, setDraftStartsAt] = useState(getDefaultStartsAt);
  const [draftLocation, setDraftLocation] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (events.length === 0) {
      setSelectedEventId('');
      return;
    }

    const stillExists = selectedEventId && events.some((event) => event.id === selectedEventId);
    if (!stillExists) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const responseGroups = useMemo(() => {
    if (!selectedEvent) {
      return null;
    }
    return groupResponses(selectedEvent.responses);
  }, [selectedEvent]);

  const myResponse = useMemo(() => {
    if (!selectedEvent || !user) {
      return null;
    }
    return selectedEvent.responses.find((response) => response.uid === user.uid) ?? null;
  }, [selectedEvent, user]);

  const handleToggleComposer = () => {
    setComposerOpen((open) => {
      const next = !open;
      if (next) {
        setDraftTitle('');
        setDraftStartsAt(getDefaultStartsAt());
        setDraftLocation('');
        setDraftDescription('');
        setFormError('');
      }
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');

    const title = draftTitle.trim();
    if (!title) {
      setFormError('Skriv en tittel.');
      return;
    }

    if (!user) {
      setFormError('Du må være innlogget for å opprette arrangementer.');
      return;
    }

    const parsedStartsAt = new Date(draftStartsAt);
    if (Number.isNaN(parsedStartsAt.getTime())) {
      setFormError('Velg en gyldig dato og tid.');
      return;
    }

    const id = createEvent({
      title,
      startsAt: draftStartsAt,
      location: draftLocation,
      description: draftDescription,
      creator: { uid: user.uid, name: user.name },
    });

    if (!id) {
      setFormError('Kunne ikke opprette arrangementet.');
      return;
    }

    setSelectedEventId(id);
    setComposerOpen(false);
    setDraftTitle('');
    setDraftStartsAt(getDefaultStartsAt());
    setDraftLocation('');
    setDraftDescription('');
  };

  const handleRespond = (status: EventRsvpStatus) => {
    if (!selectedEvent || !user) {
      return;
    }
    respondToEvent(selectedEvent.id, { uid: user.uid, name: user.name }, status);
  };

  return (
    <section className={styles.widget}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>Arrangementer</h2>
          <span className={styles.subtitle}>Opprett og svar</span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={handleToggleComposer}
            title="Opprett arrangement"
            aria-label="Opprett arrangement"
          >
            <PlusIcon />
          </button>
        </div>
      </header>

      <div className={styles.body}>
        {composerOpen && (
          <form className={styles.composer} onSubmit={handleSubmit}>
            <Input
              label="Tittel"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Sommerfest"
              maxLength={120}
              required
            />
            <Input
              label="Dato og tid"
              type="datetime-local"
              value={draftStartsAt}
              onChange={(e) => setDraftStartsAt(e.target.value)}
              required
            />
            <Input
              label="Sted"
              value={draftLocation}
              onChange={(e) => setDraftLocation(e.target.value)}
              placeholder="Kjelleren"
            />
            <label className={styles.textareaLabel}>
              <span>Beskrivelse</span>
              <textarea
                className={styles.textarea}
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                placeholder="Kort forklaring av arrangementet"
                rows={3}
              />
            </label>

            {formError && <p className={styles.error}>{formError}</p>}

            <div className={styles.formActions}>
              <Button type="button" variant="secondary" size="sm" onClick={handleToggleComposer}>
                Avbryt
              </Button>
              <Button type="submit" size="sm">
                Opprett
              </Button>
            </div>
          </form>
        )}

        <div className={styles.feed}>
          {events.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>Ingen arrangementer enda</p>
              <p className={styles.emptyText}>Trykk pluss for å opprette det første.</p>
            </div>
          ) : (
            events.map((event) => {
              const selected = event.id === selectedEventId;
              const counts = RSVP_OPTIONS.map((option) => ({
                ...option,
                count: getResponseCount(event, option.value),
              }));
              const totalResponses = event.responses.length;
              const myStatus = event.responses.find((response) => response.uid === user?.uid)?.status ?? null;

              return (
                <article
                  key={event.id}
                  className={[styles.eventCard, selected ? styles.eventCardSelected : ''].filter(Boolean).join(' ')}
                >
                  <button
                    type="button"
                    className={styles.eventSummary}
                    onClick={() => setSelectedEventId(event.id)}
                    aria-pressed={selected}
                  >
                    <div className={styles.eventSummaryMain}>
                      <div className={styles.eventHeadingRow}>
                        <h3 className={styles.eventTitle}>{event.title}</h3>
                        {myStatus && (
                          <span className={styles.myStatusBadge}>
                            {RSVP_STATUS_LABELS[myStatus]}
                          </span>
                        )}
                      </div>
                      <p className={styles.eventTime}>{formatDateTime(event.startsAt)}</p>
                      {event.location && <p className={styles.eventLocation}>{event.location}</p>}
                    </div>

                    <div className={styles.eventCounters} aria-hidden="true">
                      {counts.map((item) => (
                        <span key={item.value} className={styles.countPill}>
                          {item.count} {item.label.toLowerCase()}
                        </span>
                      ))}
                      <span className={styles.totalCount}>{totalResponses} svar</span>
                    </div>
                  </button>

                  {selected && (
                    <div className={styles.eventDetails}>
                      {event.description && <p className={styles.description}>{event.description}</p>}

                      <div className={styles.metaRow}>
                        <span>Opprettet av {event.createdBy.name}</span>
                        <span>{myResponse ? `Du: ${RSVP_STATUS_LABELS[myResponse.status]}` : 'Du har ikke svart'}</span>
                      </div>

                      <div className={styles.responseActions}>
                        {RSVP_OPTIONS.map((option) => {
                          const active = myResponse?.status === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={[
                                styles.rsvpBtn,
                                active ? styles[`rsvpBtn${option.value}`] : '',
                              ].filter(Boolean).join(' ')}
                              onClick={() => handleRespond(option.value)}
                              disabled={!user}
                              aria-pressed={active}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className={styles.responseGroups}>
                        {RSVP_OPTIONS.map((option) => {
                          const group = responseGroups?.[option.value] ?? [];
                          return (
                            <div key={option.value} className={styles.responseGroup}>
                              <span className={styles.responseLabel}>
                                {option.label} <span className={styles.responseCount}>({group.length})</span>
                              </span>
                              <div className={styles.responseList}>
                                {group.length === 0 ? (
                                  <span className={styles.responseEmpty}>Ingen enda</span>
                                ) : (
                                  group.map((response) => (
                                    <span
                                      key={response.uid}
                                      className={[
                                        styles.responseChip,
                                        response.uid === user?.uid ? styles.responseChipSelf : '',
                                      ].filter(Boolean).join(' ')}
                                    >
                                      {response.name}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
