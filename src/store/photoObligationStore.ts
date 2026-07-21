import { create } from 'zustand';
import type { PhotoObligation } from '@/types';
import {
  loadMyPhotoObligations,
  resolveNoPhotos as apiResolveNoPhotos,
  snoozePhotoObligation as apiSnooze,
} from '@/services/photoObligations';

interface PhotoObligationStore {
  obligations: PhotoObligation[];
  loaded: boolean;
  load: () => Promise<void>;
  resolveNoPhotos: (id: string) => Promise<void>;
  snooze: (id: string) => Promise<void>;
}

export const usePhotoObligationStore = create<PhotoObligationStore>((set, get) => ({
  obligations: [],
  loaded: false,
  load: async () => {
    try {
      const obligations = await loadMyPhotoObligations();
      set({ obligations, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  resolveNoPhotos: async (id) => {
    await apiResolveNoPhotos(id);
    set({ obligations: get().obligations.filter((o) => o.id !== id) });
  },
  snooze: async (id) => {
    await apiSnooze(id);
    set({ obligations: get().obligations.filter((o) => o.id !== id) });
  },
}));

/** True when the user has an unresolved "required" photo obligation that locks actions. */
export function hasBlockingObligation(): boolean {
  return usePhotoObligationStore.getState().obligations.length > 0;
}
