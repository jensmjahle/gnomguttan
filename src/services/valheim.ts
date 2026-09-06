import { appApi } from '@/services/appApi';

export interface ValheimServer {
  id: string;
  name: string;
  address: string;
  online: boolean;
  version: string | null;
  world: string | null;
  players: { online: number; max: number; sample: string[] } | null;
  /** Populated only if the server answers A2S_PLAYER with real names. */
  playerList: { name: string; score: number; durationSeconds: number | null }[];
  latencyMs: number | null;
  error: string | null;
  password: string | null;
  joinCode: string | null;
}

export interface ValheimServerList {
  configured: boolean;
  servers: ValheimServer[];
}

export async function loadValheimServers(): Promise<ValheimServerList> {
  return appApi.get<ValheimServerList>('/valheim');
}
