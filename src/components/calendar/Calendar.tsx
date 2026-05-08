import { useState } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  addMonths,
  subMonths,
} from 'date-fns';
import type { CalendarEvent } from '@/types';
import styles from './Calendar.module.css';

interface Props {
  events?: CalendarEvent[];
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function Calendar({ events = [] }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const eventsOnDay = (day: Date) =>
    events.filter((e) => isSameDay(e.date, day));

  const selectedDayEvents = selectedDay ? eventsOnDay(selectedDay) : [];

  return (
    <div className={styles.calendar}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.navBtn} onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft />
        </button>
        <h2 className={styles.monthLabel}>{format(currentMonth, 'MMMM yyyy')}</h2>
        <button className={styles.navBtn} onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight />
        </button>
        <button
          className={styles.todayBtn}
          onClick={() => { setCurrentMonth(new Date()); setSelectedDay(new Date()); }}
        >
          Today
        </button>
      </div>

      {/* Weekday labels */}
      <div className={styles.weekdays}>
        {WEEKDAYS.map((d) => <span key={d} className={styles.weekday}>{d}</span>)}
      </div>

      {/* Day grid */}
      <div className={styles.grid}>
        {days.map((day) => {
          const dayEvents = eventsOnDay(day);
          const outside = !isSameMonth(day, currentMonth);
          const today = isToday(day);
          const selected = selectedDay ? isSameDay(day, selectedDay) : false;

          return (
            <button
              key={day.toISOString()}
              className={[
                styles.day,
                outside ? styles.outside : '',
                today ? styles.today : '',
                selected ? styles.selected : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setSelectedDay(day)}
            >
              <span className={styles.dayNum}>{format(day, 'd')}</span>
              {dayEvents.length > 0 && (
                <div className={styles.dots}>
                  {dayEvents.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className={styles.dot}
                      style={{ background: e.color ?? 'var(--accent)' }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day events */}
      {selectedDay && (
        <div className={styles.eventList}>
          <p className={styles.eventListTitle}>{format(selectedDay, 'EEEE, MMMM d')}</p>
          {selectedDayEvents.length === 0 ? (
            <p className={styles.noEvents}>No events</p>
          ) : (
            selectedDayEvents.map((e) => (
              <div key={e.id} className={styles.event} style={{ borderLeftColor: e.color ?? 'var(--accent)' }}>
                <span className={styles.eventTitle}>{e.title}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
