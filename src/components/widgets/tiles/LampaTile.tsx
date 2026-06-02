import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadHomeAssistantEntity,
  toggleHomeAssistantEntity,
  type HomeAssistantEntityState,
} from '@/services/homeAssistant';
import { TileButton } from '../StreamDeck';

const POLL_MS = 5000;

function LampIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/>
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
    </svg>
  );
}

export function LampaTile() {
  const [entity, setEntity]  = useState<HomeAssistantEntityState | null>(null);
  const mountedRef            = useRef(true);
  const toggleInFlightRef     = useRef(false);
  const refreshInFlightRef    = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current || toggleInFlightRef.current || !mountedRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const next = await loadHomeAssistantEntity();
      if (mountedRef.current) setEntity(next);
    } catch { /* ignore */ } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [refresh]);

  async function handleClick() {
    if (toggleInFlightRef.current || !entity?.available) return;
    const previous = entity;
    const optimistic: HomeAssistantEntityState = {
      ...previous,
      isOn:  !previous.isOn,
      state: previous.isOn ? 'off' : 'on',
    };
    toggleInFlightRef.current = true;
    setEntity(optimistic);
    try {
      const next = await toggleHomeAssistantEntity();
      if (mountedRef.current) setEntity(next);
    } catch {
      if (mountedRef.current) setEntity(previous);
    } finally {
      toggleInFlightRef.current = false;
    }
  }

  const isOn      = Boolean(entity?.isOn && entity?.available);
  const iconColor = isOn ? '#ffd63f' : undefined; // yellow when on, grey when off

  return (
    <TileButton
      label="Lampa til Jens"
      onClick={() => void handleClick()}
      color={iconColor}
    >
      <LampIcon />
    </TileButton>
  );
}
