import { config } from '@/config';

const JELLYFIN_PROXY_PREFIX = '/jellyfin';
const DEFAULT_LIMIT = 8;

export class JellyfinApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'JellyfinApiError';
  }
}

export interface HubertCinemaMovie {
  id: string;
  title: string;
  overview: string;
  genres: string[];
  kindLabel: string;
  year?: number;
  runtimeLabel?: string;
  rating?: number;
  addedAt?: string;
  posterUrl?: string;
  detailsUrl: string;
}

interface RawImageTags {
  Primary?: string;
  primary?: string;
  [key: string]: string | undefined;
}

interface RawJellyfinItem {
  Id?: string;
  id?: string;
  Name?: string;
  name?: string;
  Overview?: string;
  overview?: string;
  ProductionYear?: number;
  productionYear?: number;
  RunTimeTicks?: number;
  runTimeTicks?: number;
  CommunityRating?: number;
  communityRating?: number;
  Genres?: string[];
  genres?: string[];
  DateCreated?: string;
  dateCreated?: string;
  Type?: string;
  type?: string;
  ImageTags?: RawImageTags;
  imageTags?: RawImageTags;
}

interface RawJellyfinItemsResponse {
  Items?: RawJellyfinItem[];
  items?: RawJellyfinItem[];
}

function proxyPath(path: string) {
  return `${JELLYFIN_PROXY_PREFIX}${path}`;
}

function pickString(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

function pickNumber(...values: Array<number | undefined>) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function pickGenres(...values: Array<string[] | undefined>) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value.filter((genre): genre is string => typeof genre === 'string' && genre.trim().length > 0);
    }
  }
  return [];
}

function formatRuntime(ticks?: number) {
  if (typeof ticks !== 'number' || !Number.isFinite(ticks) || ticks <= 0) {
    return undefined;
  }

  const totalMinutes = Math.round(ticks / 10_000_000 / 60);
  if (totalMinutes <= 0) {
    return undefined;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours}t ${minutes}m` : `${minutes}m`;
}

function posterUrl(id: string, imageTags?: RawImageTags) {
  const params = new URLSearchParams({ maxWidth: '640' });
  const imageTag = pickString(imageTags?.Primary, imageTags?.primary);
  if (imageTag) {
    params.set('tag', imageTag);
  }

  return proxyPath(`/Items/${id}/Images/Primary?${params.toString()}`);
}

function kindLabel(type?: string) {
  return type?.trim().toLowerCase() === 'series' ? 'Serie' : 'Film';
}

function detailsUrl(id: string) {
  const base = config.jellyfinClientUrl.replace(/\/$/, '');
  return `${base}/web/index.html#/details?id=${encodeURIComponent(id)}`;
}

function normalizeMovie(item: RawJellyfinItem): HubertCinemaMovie | null {
  const id = pickString(item.Id, item.id);
  if (!id) {
    return null;
  }

  const title = pickString(item.Name, item.name) ?? 'Uten tittel';
  const overview = pickString(item.Overview, item.overview) ?? '';
  const genres = pickGenres(item.Genres, item.genres);
  const imageTags = item.ImageTags ?? item.imageTags;
  const itemType = pickString(item.Type, item.type);

  return {
    id,
    title,
    overview,
    genres,
    kindLabel: kindLabel(itemType),
    year: pickNumber(item.ProductionYear, item.productionYear),
    runtimeLabel: formatRuntime(pickNumber(item.RunTimeTicks, item.runTimeTicks)),
    rating: pickNumber(item.CommunityRating, item.communityRating),
    addedAt: pickString(item.DateCreated, item.dateCreated),
    posterUrl: posterUrl(id, imageTags),
    detailsUrl: detailsUrl(id),
  };
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(proxyPath(path), {
    credentials: 'same-origin',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new JellyfinApiError(response.status, body || `HTTP ${response.status}: ${path}`);
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export async function getRecentHubertMovies(limit = DEFAULT_LIMIT): Promise<HubertCinemaMovie[]> {
  const params = new URLSearchParams({
    includeItemTypes: 'Movie,Series',
    recursive: 'true',
    sortBy: 'DateCreated',
    sortOrder: 'Descending',
    limit: String(limit),
    fields: 'Overview,ProductionYear,RunTimeTicks,Genres,CommunityRating,DateCreated,Type',
  });

  const response = await request<RawJellyfinItemsResponse>(`/Items?${params.toString()}`);
  const items = response.Items ?? response.items ?? [];
  return items.map(normalizeMovie).filter((movie): movie is HubertCinemaMovie => movie !== null);
}
