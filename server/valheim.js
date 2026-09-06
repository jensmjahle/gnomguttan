import { queryValheim, queryValheimPlayers } from './valheimQuery.js';

const CACHE_TTL_MS = 5000;
const PROBE_TIMEOUT_MS = 2500;
const DEFAULT_GAME_PORT = 2456;

/**
 * Everything on the Valheim page comes from the server's own Steam query
 * response, so all the app needs is an address. Nothing here talks to Docker.
 *
 * VALHEIM_SERVER_ADDRESS="192.168.0.190:2456"
 * (a comma-separated list works too, if there is ever more than one)
 */
export function parseServerAddresses(raw) {
  return String(raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const at = entry.lastIndexOf('@');
      const name = at > 0 ? entry.slice(0, at).trim() : '';
      const target = (at > 0 ? entry.slice(at + 1) : entry).trim().replace(/^\w+:\/\//, '');

      const colon = target.lastIndexOf(':');
      const hasPort = colon > 0 && /^\d+$/.test(target.slice(colon + 1));
      const host = (hasPort ? target.slice(0, colon) : target).trim();
      const port = hasPort ? Number(target.slice(colon + 1)) : DEFAULT_GAME_PORT;

      // Hostnames and IPv4 only; the query socket is UDP/IPv4.
      if (!/^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(host)) return null;
      if (!Number.isInteger(port) || port < 1 || port > 65534) return null;
      return { name: name || null, host, port };
    })
    .filter(Boolean);
}

function configuredAddresses() {
  return parseServerAddresses(process.env.VALHEIM_SERVER_ADDRESS ?? process.env.VALHEIM_SERVERS);
}

/** Always include the port: Valheim's "Join by IP" field expects host:port. */
function displayAddress(entry) {
  return `${entry.host}:${entry.port}`;
}

async function describeServer(entry) {
  // Valheim answers Steam queries on the game port + 1.
  const queryPort = entry.port + 1;
  const [result, playerList] = await Promise.all([
    queryValheim(entry.host, queryPort, { timeout: PROBE_TIMEOUT_MS }),
    // Most Valheim servers answer this with an empty list; if yours does fill it
    // in, the names show up on their own.
    queryValheimPlayers(entry.host, queryPort, { timeout: PROBE_TIMEOUT_MS }),
  ]);
  const online = Boolean(result.online);

  // Valheim puts the server name in the A2S "map" field and reports a stub
  // version of 1.0.0.0, so neither is worth showing unless it says something.
  const serverName = result.motd ?? null;
  const reportedWorld = result.world && result.world !== serverName ? result.world : null;
  const world = process.env.VALHEIM_WORLD?.trim() || reportedWorld;
  const version = result.version && !/^1\.0\.0\.0$/.test(result.version) ? result.version : null;

  return {
    id: `${entry.host}:${entry.port}`,
    name: entry.name || result.motd || displayAddress(entry),
    address: process.env.VALHEIM_PUBLIC_ADDRESS?.trim() || displayAddress(entry),
    online,
    version,
    world,
    players: result.players ?? null,
    playerList: playerList.players ?? [],
    latencyMs: result.latencyMs ?? null,
    error: online ? null : result.error ?? null,
    password: process.env.VALHEIM_SERVER_PASSWORD?.trim() || null,
    // Valheim only prints the crossplay join code to the server console, so it
    // cannot be read over the network. Set it here if you want it shown.
    joinCode: process.env.VALHEIM_JOIN_CODE?.trim() || null,
  };
}

let cache = { at: 0, servers: [] };
let inFlight = null;

export async function listValheimServers({ force = false } = {}) {
  const addresses = configuredAddresses();
  if (!addresses.length) {
    return { configured: false, servers: [] };
  }

  const fresh = !force && Date.now() - cache.at < CACHE_TTL_MS;
  if (!fresh) {
    if (!inFlight) {
      inFlight = Promise.all(addresses.map(describeServer))
        .then((servers) => {
          cache = { at: Date.now(), servers };
          return servers;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    await inFlight;
  }

  return { configured: true, servers: cache.servers };
}
