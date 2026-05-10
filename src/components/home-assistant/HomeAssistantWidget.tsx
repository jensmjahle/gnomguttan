import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadHomeAssistantEntity,
  toggleHomeAssistantEntity,
  type HomeAssistantEntityState,
} from '@/services/homeAssistant';
import styles from './HomeAssistantWidget.module.css';

const REFRESH_INTERVAL_MS = 5000;
const TITLE = 'Lampa til Jens';

function LampIcon({ active }: { active: boolean }) {
  return (
    <svg width="76" height="76" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {active && (
        <>
          <path d="M12 2v2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M5.8 5.8l1.8 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18.2 5.8l-1.8 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M3.5 12H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18 12h2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M5.8 18.2l1.8-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18.2 18.2l-1.8-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 21.5V19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      <path
        d="M8.8 10.4a3.2 3.2 0 1 1 6.4 0c0 1.2-.54 1.98-1.28 2.82-.42.49-.84 1-1.1 1.66h-1.64c-.26-.66-.68-1.17-1.1-1.66-.74-.84-1.28-1.62-1.28-2.82Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.14 : 0}
      />
      <path
        d="M9.3 18.2h5.4M9.9 20.2h4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function getStateLabel(entity: HomeAssistantEntityState | null) {
  if (!entity) {
    return 'Henter...';
  }

  if (!entity.available) {
    return 'Ukjent';
  }

  return entity.isOn ? 'på' : 'av';
}

function toggleEntityState(entity: HomeAssistantEntityState): HomeAssistantEntityState {
  return {
    ...entity,
    state: entity.isOn ? 'off' : 'on',
    isOn: !entity.isOn,
  };
}

export function HomeAssistantWidget() {
  const [entity, setEntity] = useState<HomeAssistantEntityState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const mountedRef = useRef(true);
  const refreshInFlightRef = useRef(false);
  const toggleInFlightRef = useRef(false);
  const mutationRevisionRef = useRef(0);

  const refreshEntity = useCallback(async () => {
    if (refreshInFlightRef.current || !mountedRef.current || toggleInFlightRef.current) {
      return;
    }

    const refreshRevision = mutationRevisionRef.current;
    refreshInFlightRef.current = true;

    try {
      const nextEntity = await loadHomeAssistantEntity();
      if (!mountedRef.current) {
        return;
      }

      if (refreshRevision !== mutationRevisionRef.current) {
        return;
      }

      setEntity(nextEntity);
    } catch (caughtError) {
      if (!mountedRef.current) {
        return;
      }

      console.error(`[HomeAssistant] Failed to refresh ${TITLE}:`, caughtError);
    } finally {
      refreshInFlightRef.current = false;
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    console.log(`[HomeAssistant] Widget mounted: ${TITLE}`);

    void refreshEntity();

    const intervalId = window.setInterval(() => {
      void refreshEntity();
    }, REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshEntity();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      console.log(`[HomeAssistant] Widget unmounted: ${TITLE}`);
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshEntity]);

  const handleToggle = useCallback(async () => {
    console.log(`[HomeAssistant] Toggle requested for ${TITLE}`, {
      hasEntity: Boolean(entity),
      available: entity?.available ?? null,
      isOn: entity?.isOn ?? null,
      isLoading,
      isToggling,
      toggleInFlight: toggleInFlightRef.current,
      mounted: mountedRef.current,
    });

    if (!mountedRef.current || toggleInFlightRef.current || !entity || !entity.available) {
      return;
    }

    const previousEntity = entity;
    const optimisticEntity = toggleEntityState(previousEntity);

    toggleInFlightRef.current = true;
    mutationRevisionRef.current += 1;
    setIsToggling(true);
    setEntity(optimisticEntity);

    try {
      const nextEntity = await toggleHomeAssistantEntity();
      if (!mountedRef.current) {
        return;
      }

      setEntity(nextEntity);
      console.log(`[HomeAssistant] Toggle completed for ${TITLE}`);
    } catch (caughtError) {
      if (!mountedRef.current) {
        return;
      }

      setEntity(previousEntity);
      console.error(`[HomeAssistant] Failed to toggle ${TITLE}:`, caughtError);
    } finally {
      toggleInFlightRef.current = false;
      if (mountedRef.current) {
        setIsToggling(false);
      }
    }
  }, [entity, isLoading, isToggling]);

  const isOn = Boolean(entity?.isOn);
  const isAvailable = Boolean(entity?.available);
  const isBusy = isLoading || isToggling;
  const stateLabel = getStateLabel(entity);
  const statusClass = !entity
    ? styles.loading
    : isAvailable
      ? isOn
        ? styles.on
        : styles.off
      : styles.unavailable;

  return (
    <section className={styles.widget}>
      <button
        type="button"
        className={[styles.tile, statusClass, isBusy ? styles.loading : ''].filter(Boolean).join(' ')}
        onPointerDown={() => {
          console.log(`[HomeAssistant] Button pressed: ${TITLE}`);
        }}
        onClick={() => {
          void handleToggle();
        }}
        aria-pressed={isOn}
        aria-busy={isBusy}
        aria-label={`${TITLE}, ${stateLabel}`}
      >
        <span className={styles.iconWrap} aria-hidden="true">
          <LampIcon active={isOn && isAvailable} />
        </span>
        <span className={styles.title}>{TITLE}</span>
      </button>
    </section>
  );
}
