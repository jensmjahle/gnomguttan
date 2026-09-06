import dgram from 'node:dgram';

const QUERY_TIMEOUT_MS = 3000;

// ── Steam A2S_INFO (Valheim) ────────────────────────────────────────────────

const A2S_HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const A2S_INFO_PAYLOAD = Buffer.concat([
  Buffer.from([0x54]),
  Buffer.from('Source Engine Query', 'ascii'),
  Buffer.from([0x00]),
]);

function readCString(buffer, offset) {
  const end = buffer.indexOf(0x00, offset);
  const stop = end === -1 ? buffer.length : end;
  return { value: buffer.subarray(offset, stop).toString('utf8'), offset: stop + 1 };
}

function parseA2sInfo(buffer) {
  let offset = 5; // 4 header bytes + the response-type byte.
  offset += 1; // Protocol byte.

  const name = readCString(buffer, offset);
  offset = name.offset;
  const map = readCString(buffer, offset);
  offset = map.offset;
  const folder = readCString(buffer, offset);
  offset = folder.offset;
  const game = readCString(buffer, offset);
  offset = game.offset;

  offset += 2; // App ID.
  const players = buffer.readUInt8(offset); offset += 1;
  const maxPlayers = buffer.readUInt8(offset); offset += 1;
  offset += 1; // Bots.
  offset += 3; // Server type, environment, visibility.
  offset += 1; // VAC.

  const version = readCString(buffer, offset);
  offset = version.offset;

  let keywords = null;
  if (offset < buffer.length) {
    const flags = buffer.readUInt8(offset); offset += 1;
    if (flags & 0x80) offset += 2; // Game port.
    if (flags & 0x10) offset += 8; // Steam ID.
    if (flags & 0x40) { // SourceTV.
      offset += 2;
      offset = readCString(buffer, offset).offset;
    }
    if (flags & 0x20) {
      const parsed = readCString(buffer, offset);
      keywords = parsed.value;
      offset = parsed.offset;
    }
  }

  return {
    name: name.value || null,
    world: map.value || null,
    game: game.value || null,
    players: { online: players, max: maxPlayers, sample: [] },
    version: version.value || null,
    keywords,
  };
}

/**
 * Valheim answers the Steam query protocol on the game port + 1, the same way
 * every Valheim image does - it is the game speaking, not the container.
 */
export function queryValheim(host, port, { timeout = QUERY_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = dgram.createSocket('udp4');
    let settled = false;
    let challenged = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      resolve(result);
    };

    const fail = (message) => finish({ online: false, error: message });
    const timer = setTimeout(() => fail('Ingen svar innen tidsfristen.'), timeout);

    const send = (payload) => {
      socket.send(Buffer.concat([A2S_HEADER, payload]), port, host, (error) => {
        if (error) fail(error.message);
      });
    };

    socket.on('error', (error) => fail(error.message));

    socket.on('message', (message) => {
      if (message.length < 5) return fail('For kort svar fra serveren.');
      const type = message.readUInt8(4);

      if (type === 0x41) {
        // Challenge: repeat the request with the token appended.
        if (challenged) return fail('Serveren fortsatte a be om challenge.');
        challenged = true;
        send(Buffer.concat([A2S_INFO_PAYLOAD, message.subarray(5, 9)]));
        return;
      }

      if (type !== 0x49) return fail('Uventet svartype fra serveren.');

      try {
        const info = parseA2sInfo(message);
        finish({
          online: true,
          latencyMs: Date.now() - startedAt,
          version: info.version,
          motd: info.name,
          players: info.players,
          icon: null,
          world: info.world,
        });
      } catch (error) {
        fail(`Kunne ikke tolke svaret: ${error.message}`);
      }
    });

    send(A2S_INFO_PAYLOAD);
  });
}

/**
 * A2S_PLAYER: the Steam query that returns the connected players by name, with
 * how long each has been on. Valheim is not known to populate this - it reports
 * a count through A2S_INFO but usually an empty player list here - so treat an
 * empty result as normal rather than a failure.
 */
export function queryValheimPlayers(host, port, { timeout = QUERY_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;
    let challenged = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      resolve(result);
    };

    const fail = (message) => finish({ supported: false, players: [], error: message });
    const timer = setTimeout(() => fail('Ingen svar innen tidsfristen.'), timeout);

    const send = (challenge) => {
      const payload = Buffer.concat([A2S_HEADER, Buffer.from([0x55]), challenge]);
      socket.send(payload, port, host, (error) => {
        if (error) fail(error.message);
      });
    };

    socket.on('error', (error) => fail(error.message));

    socket.on('message', (message) => {
      if (message.length < 5) return fail('For kort svar fra serveren.');
      const type = message.readUInt8(4);

      if (type === 0x41) {
        if (challenged) return fail('Serveren fortsatte a be om challenge.');
        challenged = true;
        send(message.subarray(5, 9));
        return;
      }

      if (type !== 0x44) return fail('Uventet svartype fra serveren.');

      try {
        const players = [];
        let offset = 5;
        const count = message.readUInt8(offset); offset += 1;

        for (let index = 0; index < count && offset < message.length; index += 1) {
          offset += 1; // Player index, which servers do not fill in reliably.
          const name = readCString(message, offset);
          offset = name.offset;
          if (offset + 8 > message.length) break;
          const score = message.readInt32LE(offset); offset += 4;
          const duration = message.readFloatLE(offset); offset += 4;

          if (name.value) {
            players.push({
              name: name.value,
              score,
              durationSeconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
            });
          }
        }

        finish({ supported: players.length > 0, players, error: null });
      } catch (error) {
        fail(`Kunne ikke tolke svaret: ${error.message}`);
      }
    });

    send(Buffer.from([0xff, 0xff, 0xff, 0xff]));
  });
}
