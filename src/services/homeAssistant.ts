import { appApi } from '@/services/appApi';

export interface HomeAssistantEntityState {
  entityId: string;
  friendlyName: string;
  state: string;
  isOn: boolean;
  available: boolean;
  lastChangedAt?: string;
  lastUpdatedAt?: string;
}

export async function loadHomeAssistantEntity(): Promise<HomeAssistantEntityState> {
  return appApi.get<HomeAssistantEntityState>('/home-assistant/entity');
}

export async function toggleHomeAssistantEntity(): Promise<HomeAssistantEntityState> {
  return appApi.post<HomeAssistantEntityState>('/home-assistant/entity/toggle');
}
