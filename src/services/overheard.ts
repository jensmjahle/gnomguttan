import { appApi } from '@/services/appApi';
import type { OverheardQuote, OverheardQuoteInput } from '@/types';

export async function loadOverheardQuotes(): Promise<OverheardQuote[]> {
  return appApi.get<OverheardQuote[]>('/overheard');
}

export async function createOverheardQuote(input: OverheardQuoteInput): Promise<OverheardQuote> {
  return appApi.post<OverheardQuote>('/overheard', input);
}
