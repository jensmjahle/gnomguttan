import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  startOfDay,
} from 'date-fns';
import { nb } from 'date-fns/locale/nb';
import type { CSSProperties } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Calendar } from '@/components/calendar/Calendar';
import { useAuth } from '@/hooks/useAuth';
import { loadCommunityEvents, respondToCommunityEvent } from '@/services/communityEvents';
import { useCommunityEventStore } from '@/store/communityEventStore';
import type { CommunityEvent, EventRsvpStatus } from '@/types';
import styles from './CalendarPage.module.css';

const CALENDAR_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#14b8a6'];
const EVENT_TYPES = ['Alle typer', 'Sosialt', 'Fylla', 'Gaming', 'Skole', 'Egendefinert'];
const STATUS_OPTIONS = [
  { value: 'all', label: 'Alle statuser' },
  { value: 'published', label: 'Publisert' },
  { value: 'draft', label: 'Kladder' },
] as const;
const EDIT_MODE_OPTIONS = [
  { value: 'all', label: 'All redigering' },
  { value: 'open', label: 'Åpen' },
  { value: 'locked', label: 'Låst' },
] as const;
const RSVP_OPTIONS: Array<{ value: EventRsvpStatus; label: string }> = [
  { value: 'coming', label: 'Kommer' },
  { value: 'maybe', label: 'Kanskje' },
  { value: 'cannot', label: 'Kan ikke' },
];

function getEventTitle(event: CommunityEvent) {
  return event.title.trim() || 'Uten tittel';
}

function getPrimaryType(event: CommunityEvent) {
  return event.eventType?.trim() || 'Sosialt';
}

function getTypeLabel(event: CommunityEvent) {
  const type = getPrimaryType(event);
  if (type === 'Egendefinert') {
    return event.customEventType?.trim() || 'Egendefinert';
  }
  return type;
}

function getEventAccent(event: CommunityEvent, index: number) {
  const source = `${event.id}:${getTypeLabel(event)}:${index}`;
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return CALENDAR_COLORS[hash % CALENDAR_COLORS.length];
}

function getEventDay(event: CommunityEvent) {
  return new Date(event.startsAt);
}

function isFutureOrToday(event: CommunityEvent) {
  return !Number.isNaN(getEventDay(event).getTime()) && differenceInCalendarDays(getEventDay(event), new Date()) >= 0;
}

function hasUserResponded(event: CommunityEvent, uid?: number) {
  if (!uid) return false;
  return event.responses.some((response) => response.uid === uid);
}

function getResponseStatus(event: CommunityEvent, uid?: number) {
  if (!uid) return null;
  return event.responses.find((response) => response.uid === uid)?.status ?? null;
}

function formatEventTime(event: CommunityEvent) {
  return format(getEventDay(event), 'd. MMM HH:mm', { locale: nb });
}

function sortBySchedule(left: CommunityEvent, right: CommunityEvent) {
  const leftTime = getEventDay(left).getTime();
  const rightTime = getEventDay(right).getTime();
  return leftTime - rightTime || right.createdAt - left.createdAt;
}

function matchesSearch(event: CommunityEvent, query: string) {
  if (!query) return true;
  const haystack = [
    getEventTitle(event),
    event.location ?? '',
    event.description ?? '',
    getTypeLabel(event),
    event.createdBy.name,
    event.customEventType ?? '',
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

function getEventStatus(event: CommunityEvent) {
  return event.status === 'draft' ? 'draft' : 'published';
}

function getEventEditMode(event: CommunityEvent) {
  return event.editMode === 'open' ? 'open' : 'locked';
}

function isUnansweredUpcoming(event: CommunityEvent, uid?: number) {
  if (!uid) return false;
  if (getEventStatus(event) !== 'published') return false;
  if (!isFutureOrToday(event)) return false;
  return !hasUserResponded(event, uid);
}

function EventCard({
  event,
  index,
}: {
  event: CommunityEvent;
  index: number;
}) {
  const accent = getEventAccent(event, index);
  const responseSummary = RSVP_OPTIONS
    .map((option) => ({
      ...option,
      count: event.responses.filter((response) => response.status === option.value).length,
    }))
    .filter((option) => option.count > 0);
  const totalResponses = event.responses.length;
  const isDraft = getEventStatus(event) === 'draft';
  const cardStyle = { '--accent': accent } as CSSProperties;

  return (
    <Link
      to={`/arrangementer/${event.id}`}
      className={styles.eventCard}
      style={cardStyle}
    >
      <div className={styles.eventAccent} />
      <div className={styles.eventCardInner}>
        <div className={styles.eventCardMain}>
          <div className={styles.eventHeadingRow}>
            <h3 className={styles.eventTitle}>{getEventTitle(event)}</h3>
            <div className={styles.eventBadges}>
              {isDraft && <span className={styles.badgeMuted}>Kladd</span>}
              {event.timeMode === 'proposed' && <span className={styles.badgeMuted}>Tid foreslås</span>}
              {getEventEditMode(event) === 'open' && <span className={styles.badgeOpen}>Åpen redigering</span>}
            </div>
          </div>

          <div className={styles.eventMeta}>
            <span>{formatEventTime(event)}</span>
            {event.location && <span>{event.location}</span>}
            <span>{getTypeLabel(event)}</span>
          </div>

          {event.description && (
            <p className={styles.eventDescription}>
              {event.description}
            </p>
          )}

          <div className={styles.eventStats}>
            {responseSummary.map((item) => (
              <span key={item.value} className={styles.statPill}>
                {item.count} {item.label.toLowerCase()}
              </span>
            ))}
            <span className={styles.statPillStrong}>{totalResponses} svar</span>
          </div>
        </div>

        <div className={styles.eventThumbWrap}>
          {event.imageUrl ? (
            <img className={styles.eventThumb} src={event.imageUrl} alt="" />
          ) : (
            <div className={styles.eventThumbFallback}>
              <span>{getTypeLabel(event)}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function UnansweredCard({
  event,
  index,
  busy,
  onRespond,
}: {
  event: CommunityEvent;
  index: number;
  busy: boolean;
  onRespond: (eventId: string, status: EventRsvpStatus) => void;
}) {
  const responseStatus = getResponseStatus(event, useAuth().user?.uid);
  const cardStyle = { '--accent': getEventAccent(event, index) } as CSSProperties;

  return (
    <div className={styles.unansweredCard} style={cardStyle}>
      <div className={styles.unansweredMain}>
        <Link to={`/arrangementer/${event.id}`} className={styles.unansweredTitleLink}>
          <h4 className={styles.unansweredTitle}>{getEventTitle(event)}</h4>
        </Link>
        <p className={styles.unansweredMeta}>{formatEventTime(event)} {event.location ? `· ${event.location}` : ''}</p>
        <p className={styles.unansweredText}>
          {responseStatus ? `Du har svart: ${responseStatus === 'coming' ? 'kommer' : responseStatus === 'maybe' ? 'kanskje' : 'kan ikke'}` : 'Du har ikke svart'}
        </p>
      </div>

      <div className={styles.unansweredActions}>
        {RSVP_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={[styles.rsvpBtn, responseStatus === option.value ? styles.rsvpBtnActive : ''].filter(Boolean).join(' ')}
            onClick={() => onRespond(event.id, option.value)}
            disabled={busy}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CalendarPage() {
  const { user } = useAuth();
  const events = useCommunityEventStore((state) => state.events);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('Alle typer');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]['value'] | 'all'>('all');
  const [editModeFilter, setEditModeFilter] = useState<(typeof EDIT_MODE_OPTIONS)[number]['value'] | 'all'>('all');
  const [onlyUnanswered, setOnlyUnanswered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busyEventId, setBusyEventId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setIsLoading(true);
      setLoadError('');
      try {
        await loadCommunityEvents({ includeDrafts: true });
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

  const calendarEvents = useMemo(
    () =>
      events.map((event, index) => ({
        id: event.id,
        title: getEventTitle(event),
        date: getEventDay(event),
        color: getEventAccent(event, index),
      })),
    [events]
  );

  const unansweredEvents = useMemo(
    () =>
      events
        .filter((event) => isUnansweredUpcoming(event, user?.uid))
        .sort(sortBySchedule)
        .slice(0, 5),
    [events, user?.uid]
  );

  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return events
      .filter((event) => {
        if (selectedDay && !isSameDay(getEventDay(event), selectedDay)) {
          return false;
        }

        if (!matchesSearch(event, query)) {
          return false;
        }

        if (typeFilter !== 'Alle typer') {
          const primaryType = getPrimaryType(event);
          if (typeFilter === 'Egendefinert') {
            if (primaryType !== 'Egendefinert') {
              return false;
            }
          } else if (primaryType !== typeFilter) {
            return false;
          }
        }

        if (statusFilter !== 'all' && getEventStatus(event) !== statusFilter) {
          return false;
        }

        if (editModeFilter !== 'all' && getEventEditMode(event) !== editModeFilter) {
          return false;
        }

        if (onlyUnanswered && !isUnansweredUpcoming(event, user?.uid)) {
          return false;
        }

        return true;
      })
      .sort(sortBySchedule);
  }, [events, editModeFilter, onlyUnanswered, searchQuery, selectedDay, statusFilter, typeFilter, user?.uid]);

  const groupedEvents = useMemo(() => {
    if (selectedDay) {
      return [
        {
          key: 'selected',
          label: format(selectedDay, 'EEEE d. MMMM', { locale: nb }),
          events: filteredEvents,
        },
      ];
    }

    const drafts = filteredEvents.filter((event) => getEventStatus(event) === 'draft');
    const published = filteredEvents.filter((event) => getEventStatus(event) === 'published');
    const today = startOfDay(new Date());
    const nextWeek = addDays(today, 7);
    const past = published.filter((event) => getEventDay(event) < today);
    const upcoming = published.filter((event) => getEventDay(event) >= today && getEventDay(event) < nextWeek);
    const later = published.filter((event) => getEventDay(event) >= nextWeek);

    return [
      {
        key: 'drafts',
        label: 'Kladder',
        events: drafts,
      },
      {
        key: 'upcoming',
        label: 'Neste uke',
        events: upcoming,
      },
      {
        key: 'later',
        label: 'Senere',
        events: later,
      },
      {
        key: 'past',
        label: 'Tidligere',
        events: past,
      },
    ].filter((group) => group.events.length > 0);
  }, [filteredEvents, selectedDay]);

  const handleQuickRespond = async (eventId: string, status: EventRsvpStatus) => {
    if (!user || busyEventId) {
      return;
    }

    setBusyEventId(eventId);
    setLoadError('');

    try {
      await respondToCommunityEvent(eventId, status);
    } catch {
      setLoadError('Kunne ikke oppdatere svaret.');
    } finally {
      setBusyEventId(null);
    }
  };

  const hasAnyFilters =
    searchQuery.trim().length > 0 ||
    typeFilter !== 'Alle typer' ||
    statusFilter !== 'all' ||
    editModeFilter !== 'all' ||
    onlyUnanswered;

  return (
    <AppLayout>
      <div className={styles.page}>
        <aside className={styles.sidebar}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelKicker}>Kalender</p>
                <h1 className={styles.panelTitle}>Arrangementer</h1>
              </div>
              {selectedDay && (
                <button type="button" className={styles.clearButton} onClick={() => setSelectedDay(null)}>
                  Nullstill dag
                </button>
              )}
            </div>
            <div className={styles.calendarBody}>
              <Calendar
                events={calendarEvents}
                selectedDay={selectedDay}
                onSelectedDayChange={setSelectedDay}
              />
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelKicker}>Du har ikke svart</p>
                <h2 className={styles.sectionTitle}>{unansweredEvents.length} arrangementer</h2>
              </div>
            </div>
            <div className={styles.unansweredList}>
              {unansweredEvents.length === 0 ? (
                <p className={styles.emptyText}>Ingen kommende arrangementer du mangler å svare på.</p>
              ) : (
                unansweredEvents.map((event, index) => (
                  <UnansweredCard
                    key={event.id}
                    event={event}
                    index={index}
                    busy={busyEventId === event.id}
                    onRespond={handleQuickRespond}
                  />
                ))
              )}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelKicker}>Filtre</p>
                <h2 className={styles.sectionTitle}>Avgrens listen</h2>
              </div>
              {hasAnyFilters && (
                <button
                  type="button"
                  className={styles.clearButton}
                  onClick={() => {
                    setSearchQuery('');
                    setTypeFilter('Alle typer');
                    setStatusFilter('all');
                    setEditModeFilter('all');
                    setOnlyUnanswered(false);
                  }}
                >
                  Nullstill
                </button>
              )}
            </div>

            <div className={styles.filters}>
              <label className={styles.field}>
                <span>Søk</span>
                <input
                  className={styles.input}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Søk i tittel, sted eller type"
                />
              </label>

              <label className={styles.field}>
                <span>Type</span>
                <select className={styles.select} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  {EVENT_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Status</span>
                <select className={styles.select} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Redigering</span>
                <select className={styles.select} value={editModeFilter} onChange={(event) => setEditModeFilter(event.target.value as typeof editModeFilter)}>
                  {EDIT_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={onlyUnanswered}
                  onChange={(event) => setOnlyUnanswered(event.target.checked)}
                />
                <span>Vis bare arrangementer du ikke har svart på</span>
              </label>

              <Link to="/arrangementer/ny" className={styles.createButton}>
                Lag nytt arrangement
              </Link>
            </div>
          </section>
        </aside>

        <main className={styles.main}>
          <div className={styles.mainHeader}>
            <div>
              <p className={styles.panelKicker}>Liste</p>
              <h2 className={styles.mainTitle}>Alle arrangementer</h2>
            </div>
            <div className={styles.mainMeta}>
              <span>{filteredEvents.length} treff</span>
              {selectedDay && <span>{format(selectedDay, 'd. MMM', { locale: nb })}</span>}
            </div>
          </div>

          <div className={styles.mainScroll}>
            {loadError && <div className={styles.errorBanner}>{loadError}</div>}

            {isLoading && events.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyTitle}>Laster arrangementer</p>
                <p className={styles.emptyText}>Henter publiserte arrangementer og kladder.</p>
              </div>
            ) : groupedEvents.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyTitle}>Ingen arrangementer matcher filtrene</p>
                <p className={styles.emptyText}>Prøv å nullstille filtrene eller velg en annen dato.</p>
              </div>
            ) : (
              groupedEvents.map((group) => (
                <section key={group.key} className={styles.group}>
                  <div className={styles.groupHeader}>
                    <h3 className={styles.groupTitle}>{group.label}</h3>
                    <span className={styles.groupCount}>{group.events.length}</span>
                  </div>
                  <div className={styles.eventList}>
                    {group.events.map((event, index) => (
                      <EventCard key={event.id} event={event} index={index} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </main>
      </div>
    </AppLayout>
  );
}
