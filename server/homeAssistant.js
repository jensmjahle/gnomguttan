import 'dotenv/config';

const DEFAULT_ENTITY_ID = 'switch.lampa_til_jens';
const REQUEST_TIMEOUT_MS = 5000;

const homeAssistantUrl = trimTrailingSlash(process.env.HOME_ASSISTANT_URL?.trim() ?? '');
const homeAssistantToken = process.env.HOME_ASSISTANT_TOKEN?.trim() ?? '';
const homeAssistantEntityId =
  process.env.HOME_ASSISTANT_ENTITY_ID?.trim() ||
  process.env.HOME_ASSISTANT_LIGHT_ENTITY_ID?.trim() ||
  DEFAULT_ENTITY_ID;

let hasLoggedHomeAssistantConnection = false;
let lastLoggedHomeAssistantStateKey = '';

export class HomeAssistantError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'HomeAssistantError';
    this.status = status;
  }
}

export function getHomeAssistantEntityId() {
  return homeAssistantEntityId;
}

export async function getHomeAssistantEntityState() {
  ensureConfigured();
  const payload = await requestHomeAssistantJson(`/api/states/${encodeURIComponent(homeAssistantEntityId)}`, {
    errorMessage: 'Kunne ikke hente status fra Home Assistant.',
  });
  const entity = normalizeEntityState(payload);
  logHomeAssistantEntity(entity);
  return entity;
}

export async function toggleHomeAssistantEntity() {
  ensureConfigured();
  const currentEntity = await getHomeAssistantEntityState();
  if (!currentEntity.available) {
    throw new HomeAssistantError('Enheten er ikke tilgjengelig.', 503);
  }

  const nextEntity = {
    ...currentEntity,
    state: currentEntity.isOn ? 'off' : 'on',
    isOn: !currentEntity.isOn,
  };

  await requestHomeAssistantJson(`/api/services/${getEntityDomain(homeAssistantEntityId)}/toggle`, {
    method: 'POST',
    body: { entity_id: homeAssistantEntityId },
    errorMessage: 'Kunne ikke styre enheten i Home Assistant.',
  });
  return nextEntity;
}

function ensureConfigured() {
  if (!homeAssistantUrl) {
    throw new HomeAssistantError('HOME_ASSISTANT_URL mangler.', 503);
  }

  if (!homeAssistantToken) {
    throw new HomeAssistantError('HOME_ASSISTANT_TOKEN mangler.', 503);
  }

  try {
    new URL(homeAssistantUrl);
  } catch {
    throw new HomeAssistantError('HOME_ASSISTANT_URL er ikke en gyldig URL.', 503);
  }
}

function getEntityDomain(entityId) {
  const domain = entityId.split('.')[0]?.trim();
  if (!domain) {
    throw new HomeAssistantError('HOME_ASSISTANT_ENTITY_ID must use the format domain.entity_id.', 503);
  }

  return domain;
}

async function requestHomeAssistantJson(pathname, { method = 'GET', body, errorMessage } = {}) {
  let response;

  try {
    console.log(`[HomeAssistant] ${method} ${pathname}`);
    response = await fetchWithTimeout(`${homeAssistantUrl}${pathname}`, {
      method,
      headers: buildHeaders(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    resetHomeAssistantLogState();
    console.error(`[HomeAssistant] ${method} ${pathname} failed before response`, error);
    if (error instanceof HomeAssistantError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new HomeAssistantError('Home Assistant svarte ikke i tide.', 504);
    }

    throw new HomeAssistantError('Kunne ikke kontakte Home Assistant.', 502);
  }

  if (!response.ok) {
    resetHomeAssistantLogState();
    console.error(`[HomeAssistant] ${method} ${pathname} returned ${response.status}`);
    throw await buildHomeAssistantHttpError(response, errorMessage);
  }

  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    resetHomeAssistantLogState();
    console.error(`[HomeAssistant] ${method} ${pathname} returned invalid JSON`);
    throw new HomeAssistantError('Ugyldig svar fra Home Assistant.', 502);
  }
}

function buildHeaders(includeJsonBody) {
  return {
    Authorization: `Bearer ${homeAssistantToken}`,
    Accept: 'application/json',
    ...(includeJsonBody ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function buildHomeAssistantHttpError(response, errorMessage) {
  const body = await response.text().catch(() => '');

  if (response.status === 401 || response.status === 403) {
    return new HomeAssistantError('Home Assistant-token ble avvist.', 502);
  }

  if (response.status === 404) {
    return new HomeAssistantError('Fant ikke enheten i Home Assistant.', 404);
  }

  const parsedMessage = extractErrorMessage(body);
  return new HomeAssistantError(parsedMessage || errorMessage || `Home Assistant svarte med ${response.status}.`, response.status >= 500 ? 502 : response.status);
}

async function fetchWithTimeout(url, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeEntityState(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new HomeAssistantError('Ugyldig status fra Home Assistant.', 502);
  }

  const attributes = typeof payload.attributes === 'object' && payload.attributes !== null ? payload.attributes : {};
  const state = typeof payload.state === 'string' ? payload.state : 'unknown';
  const friendlyName =
    typeof attributes.friendly_name === 'string' && attributes.friendly_name.trim()
      ? attributes.friendly_name.trim()
      : 'Lampa til Jens';

  return {
    entityId: typeof payload.entity_id === 'string' && payload.entity_id.trim() ? payload.entity_id.trim() : homeAssistantEntityId,
    friendlyName,
    state,
    isOn: state === 'on',
    available: state !== 'unavailable' && state !== 'unknown',
    lastChangedAt: typeof payload.last_changed === 'string' ? payload.last_changed : undefined,
    lastUpdatedAt: typeof payload.last_updated === 'string' ? payload.last_updated : undefined,
  };
}

function extractErrorMessage(body) {
  if (!body) {
    return '';
  }

  const trimmed = body.trim();
  if (!trimmed || trimmed.startsWith('<')) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      for (const key of ['message', 'error', 'description']) {
        if (typeof parsed[key] === 'string' && parsed[key].trim()) {
          return parsed[key].trim();
        }
      }
    }
  } catch {
    // Fall through to the raw body.
  }

  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function logHomeAssistantEntity(entity) {
  const stateLabel = entity.available ? (entity.isOn ? 'on' : 'off') : entity.state;
  const logKey = `${entity.entityId}:${stateLabel}`;

  if (!hasLoggedHomeAssistantConnection) {
    console.log(`[HomeAssistant] Connected to ${homeAssistantUrl} (${entity.entityId})`);
    hasLoggedHomeAssistantConnection = true;
  }

  if (lastLoggedHomeAssistantStateKey !== logKey) {
    console.log(`[HomeAssistant] State for ${entity.entityId}: ${stateLabel}`);
    lastLoggedHomeAssistantStateKey = logKey;
  }
}

function resetHomeAssistantLogState() {
  hasLoggedHomeAssistantConnection = false;
  lastLoggedHomeAssistantStateKey = '';
}
