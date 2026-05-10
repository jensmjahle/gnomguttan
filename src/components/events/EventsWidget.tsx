import { FormEvent, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { createCommunityEvent, loadCommunityEvents, respondToCommunityEvent } from '@/services/communityEvents';
import { useCommunityEventStore } from '@/store/communityEventStore';
import type { CommunityEvent, EventResponse, EventRsvpStatus } from '@/types';
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
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
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

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftStartsAt, setDraftStartsAt] = useState(getDefaultStartsAt);
  const [draftLocation, setDraftLocation] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setIsLoading(true);
      setLoadError('');

      try {
        await loadCommunityEvents();
      } catch {
        if (!cancelled) {
          setLoadError('Kunne ikke laste arrangementer.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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

    setIsSubmitting(true);

    try {
      await createCommunityEvent({
        title,
        startsAt: draftStartsAt,
        location: draftLocation,
        description: draftDescription,
      });

      setComposerOpen(false);
      setDraftTitle('');
      setDraftStartsAt(getDefaultStartsAt());
      setDraftLocation('');
      setDraftDescription('');
    } catch {
      setFormError('Kunne ikke opprette arrangementet.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRespond = async (eventId: string, status: EventRsvpStatus) => {
    if (!user || isSubmitting) {
      return;
    }

    setFormError('');
    setIsSubmitting(true);

    try {
      await respondToCommunityEvent(eventId, status);
    } catch {
      setFormError('Kunne ikke oppdatere svaret.');
    } finally {
      setIsSubmitting(false);
    }
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
        {loadError && <p className={styles.error}>{loadError}</p>}

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
              <Button type="button" variant="secondary" size="sm" onClick={handleToggleComposer} disabled={isSubmitting}>
                Avbryt
              </Button>
              <Button type="submit" size="sm" loading={isSubmitting}>
                Opprett
              </Button>
            </div>
          </form>
        )}

        <div className={styles.feed}>
          {isLoading && events.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>Laster arrangementer</p>
              <p className={styles.emptyText}>Henter innhold fra MongoDB.</p>
            </div>
          ) : events.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>Ingen arrangementer enda</p>
              <p className={styles.emptyText}>Trykk pluss for å opprette det første.</p>
            </div>
          ) : (
            events.map((event) => {
              const counts = RSVP_OPTIONS.map((option) => ({
                ...option,
                count: getResponseCount(event, option.value),
              }));
              const totalResponses = event.responses.length;
              const myResponse = user ? event.responses.find((response) => response.uid === user.uid) ?? null : null;
              const myStatus = myResponse?.status ?? null;
              const responseGroups = groupResponses(event.responses);

              return (
                <article key={event.id} className={styles.eventCard}>
                  <div className={styles.eventSummary}>
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
                  </div>

                  <div className={styles.eventDetails}>
                    {event.description && <p className={styles.description}>{event.description}</p>}

                    <div className={styles.metaRow}>
                      <span>Opprettet av {event.createdBy.name}</span>
                      <span>{myResponse ? `Du: ${RSVP_STATUS_LABELS[myResponse.status]}` : 'Du har ikke svart'}</span>
                    </div>

                    <div className={styles.responseActions}>
                      {RSVP_OPTIONS.map((option) => {
                        const active = myStatus === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={[
                              styles.rsvpBtn,
                              active ? styles[`rsvpBtn${option.value}`] : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => void handleRespond(event.id, option.value)}
                            disabled={!user || isSubmitting}
                            aria-pressed={active}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className={styles.responseGroups}>
                      {RSVP_OPTIONS.map((option) => {
                        const group = responseGroups[option.value];
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
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
