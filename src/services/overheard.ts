import { appApi } from '@/services/appApi';
import type { OverheardQuote, OverheardQuoteInput } from '@/types';

export async function loadOverheardQuotes(): Promise<OverheardQuote[]> {
  try {
    return await appApi.get<OverheardQuote[]>('/overheard');
  } catch {
    return [];
  }
}

export async function createOverheardQuote(input: OverheardQuoteInput): Promise<OverheardQuote> {
  return appApi.post<OverheardQuote>('/overheard', input);
}
