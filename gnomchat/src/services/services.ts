import { appApi } from '@/services/appApi';
import type { OverheardQuote, OverheardQuoteInput } from '@/types';

export interface ValheimServer {
  id: string;
  name: string;
  address: string;
  online: boolean;
  version: string | null;
  world: string | null;
  players: { online: number; max: number; sample: string[] } | null;
  playerList: { name: string; score: number; durationSeconds: number | null }[];
  latencyMs: number | null;
  error: string | null;
  password: string | null;
  joinCode: string | null;
}

export const loadValheimServers = () => appApi.get<{ configured: boolean; servers: ValheimServer[] }>('/valheim');

export interface HomeAssistantEntityState {
  entityId: string;
  friendlyName: string;
  state: string;
  isOn: boolean;
  available: boolean;
  lastChangedAt?: string;
  lastUpdatedAt?: string;
}

export const loadLamp = () => appApi.get<HomeAssistantEntityState>('/home-assistant/entity');
export const toggleLamp = () => appApi.post<HomeAssistantEntityState>('/home-assistant/entity/toggle');

export const loadOverheard = () => appApi.get<OverheardQuote[]>('/overheard');
export const createOverheard = (input: OverheardQuoteInput) => appApi.post<OverheardQuote>('/overheard', input);
