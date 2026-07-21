import { appApi } from '@/services/appApi';
import type { PhotoObligation } from '@/types';

/** Returns the current user's photo obligations that still need attention. */
export async function loadMyPhotoObligations(): Promise<PhotoObligation[]> {
  return appApi.get<PhotoObligation[]>('/photo-obligations');
}

/** "Jeg har ingen bilder" — resolves the obligation permanently. */
export async function resolveNoPhotos(obligationId: string): Promise<PhotoObligation> {
  return appApi.post<PhotoObligation>(`/photo-obligations/${obligationId}/no-photos`);
}

/** "Minn meg senere" — snoozes the obligation (and its reminders) for one day. */
export async function snoozePhotoObligation(obligationId: string): Promise<PhotoObligation> {
  return appApi.post<PhotoObligation>(`/photo-obligations/${obligationId}/snooze`);
}
