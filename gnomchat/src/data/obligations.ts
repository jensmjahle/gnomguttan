import { useQuery } from '@tanstack/react-query';
import { appApi } from '@/services/appApi';
import { qk, queryClient } from '@/data/queryClient';
import type { PhotoObligation } from '@/types';

export const usePhotoObligations = () => useQuery({ queryKey: qk.obligations, queryFn: () => appApi.get<PhotoObligation[]>('/photo-obligations'), staleTime: 60_000 });
export const hasBlockingObligation = () => (queryClient.getQueryData<PhotoObligation[]>(qk.obligations)?.length ?? 0) > 0;

export async function resolveNoPhotos(id: string) {
  await appApi.post(`/photo-obligations/${id}/no-photos`);
  await queryClient.invalidateQueries({ queryKey: qk.obligations });
}

export async function snoozeObligation(id: string) {
  await appApi.post(`/photo-obligations/${id}/snooze`);
  await queryClient.invalidateQueries({ queryKey: qk.obligations });
}

export const BLOCKED_MESSAGE = 'Du må laste opp bilder fra et tidligere arrangement først. Se gjøremålet øverst på Hjem.';
