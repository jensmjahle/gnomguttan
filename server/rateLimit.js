// A small in-memory fixed-window limiter, keyed by IP, email or user. Enough for
// one server process; it resets on restart, which only loosens the limits briefly.

export function createRateLimiter({ windowMs, max, now = () => Date.now() }) {
  const entries = new Map();
  let lastSweep = now();

  function sweep(t) {
    if (t - lastSweep < windowMs) return;
    for (const [key, entry] of entries) if (entry.resetAt <= t) entries.delete(key);
    lastSweep = t;
  }

  return {
    /** Milliseconds until `key` may try again, or 0 while it's under the limit. */
    blockedFor(key) {
      const t = now();
      const entry = entries.get(key);
      return entry && entry.resetAt > t && entry.count >= max ? entry.resetAt - t : 0;
    },
    hit(key) {
      const t = now();
      sweep(t);
      let entry = entries.get(key);
      if (!entry || entry.resetAt <= t) {
        entry = { count: 0, resetAt: t + windowMs };
        entries.set(key, entry);
      }
      entry.count += 1;
    },
    reset(key) {
      entries.delete(key);
    },
  };
}
