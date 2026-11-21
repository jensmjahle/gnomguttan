import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale/nb';
import { getProfileEvents, type ProfileEvent } from '@/services/profiles';
import styles from './Profile.module.css';

type Tab = 'upcoming' | 'previous';
const SHOWN = 5;

function EventRow({ event }: { event: ProfileEvent }) {
  const date = event.startsAt ? new Date(event.startsAt) : null;
  const proposed = event.timeMode === 'proposed';
  const when = proposed || !date ? 'Tid foreslås' : format(date, "EEEE d. MMM 'kl.' HH:mm", { locale: nb });
  return (
    <li>
      <Link to={`/arrangementer/${event.id}`} className={styles.event}>
        <span className={styles.eventDate} aria-hidden="true">
          {date && !proposed ? (
            <>
              <span className={styles.eventDay}>{format(date, 'd')}</span>
              <span className={styles.eventMonth}>{format(date, 'MMM', { locale: nb }).replace('.', '')}</span>
            </>
          ) : <span className={styles.eventDay}>?</span>}
        </span>
        <span className={styles.eventText}>
          <span className={styles.eventTitle}>{event.title}</span>
          <span className={styles.hint}>
            {when}
            {event.location ? ` · ${event.location}` : ''}
          </span>
        </span>
        {event.organizer && <span className={styles.badge}>Arrangør</span>}
      </Link>
    </li>
  );
}

/** The events someone is going to, with a tab for the ones that are over. */
export function ProfileEvents({ uid, name }: { uid: number; name: string }) {
  const [data, setData] = useState<{ upcoming: ProfileEvent[]; previous: ProfileEvent[] } | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setTab('upcoming');
    getProfileEvents(uid)
      .then((result) => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) setData({ upcoming: [], previous: [] }); });
    return () => { cancelled = true; };
  }, [uid]);

  useEffect(() => setShowAll(false), [tab]);

  const list = data?.[tab] ?? [];
  const shown = showAll ? list : list.slice(0, SHOWN);
  const tabButton = (value: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      className={`${styles.tab} ${tab === value ? styles.tabActive : ''}`}
      onClick={() => setTab(value)}
    >
      {label}
      {data && <span className={styles.tabCount}>{data[value].length}</span>}
    </button>
  );

  return (
    <section className={styles.card}>
      <h2 className={styles.sectionTitle}>Arrangementer</h2>
      <div className={styles.tabs} role="tablist" aria-label="Arrangementer">
        {tabButton('upcoming', 'Kommende')}
        {tabButton('previous', 'Tidligere')}
      </div>
      {!data && <p className={styles.empty}>Henter arrangementer…</p>}
      {data && list.length === 0 && (
        <p className={styles.empty}>
          {tab === 'upcoming' ? `${name} har ikke meldt seg på noe som kommer.` : `${name} har ikke vært med på noe ennå.`}
        </p>
      )}
      {shown.length > 0 && (
        <ul className={styles.events} role="tabpanel">
          {shown.map((event) => <EventRow key={event.id} event={event} />)}
        </ul>
      )}
      {list.length > SHOWN && (
        <button type="button" className={styles.linkButton} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Vis færre' : `Vis alle ${list.length}`}
        </button>
      )}
    </section>
  );
}
