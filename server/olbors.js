import { randomUUID } from "node:crypto";
import { BSON } from "mongodb";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { recalculate, commission, pricingSettings, houseMetrics, referenceCost, quoteNeedsProtection, emergencyPrices, protectionActive } from "./olbors-pricing.js";
import { beerAnalytics, customerAnalytics, exchangeSummary } from "./olbors-analytics.js";
import { marketSettings, marketClockDue, advanceMarketClock, startMarketEvent, endMarketEvent, normalPrices, applyMarketPrices, logPrices } from "./olbors-market.js";
import { checkoutSettings, missingProfileFields, checkoutQuote, checkoutHash } from "./olbors-checkout.js";
import { offerSettings, offerClockDue, advanceOfferClock, startSuperOffer, endSuperOffer } from "./olbors-offers.js";
const liveClients = new Map();
const PROFILE_FIELDS = ["phone", "shoe_size", "weight", "height", "marital_status", "work_relationship", "gender", "sexual_orientation", "ethnicity", "experience_level", "profile_image_url"];
function publishChange(id, version, kioskToken) {
  for (const res of liveClients.get(id) ?? []) {
    try {
      if (res.locals.kioskKey && res.locals.kioskKey !== kioskToken) {
        res.end();
        liveClients.get(id)?.delete(res);
        continue;
      }
      res.write(`event: change\ndata: ${JSON.stringify({ id, version })}\n\n`);
    } catch {
      liveClients.get(id)?.delete(res);
    }
  }
}

export const EXCHANGES = "olbors_exchanges";
export const PRICE_TICKS = "olbors_price_ticks";
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const clean = (d) => {
  const { _id, kioskToken, ...result } = d;
  return result;
};
const isAdmin = (d, u) => d.adminUids.includes(u.uid);
export const olborsMediaDir = path.resolve(
  process.env.OLBORS_MEDIA_DIR?.trim() || "data/olbors-media",
);
function imageUrl(value) {
  const url = String(value ?? "").trim();
  if (
    url &&
    !/^\/olbors-media\/[\w. -]+$/.test(url) &&
    !/^\/icons\/olbors\/[\w()-]+\.png$/.test(url) &&
    !/^https?:\/\//i.test(url)
  )
    fail(400, "Ugyldig bilde-URL.");
  return url.slice(0, 2000);
}
const number = (v, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max)
    fail(400, "Ugyldig tallverdi.");
  return n;
};

export async function ensureOlborsIndexes(db) {
  await db.collection(EXCHANGES).createIndex({ id: 1 }, { unique: true });
  await db.collection(EXCHANGES).createIndex({ created_at: -1 });
  await db.collection(PRICE_TICKS).createIndex({ event_id: 1, sample_bucket: 1 }, { unique: true });
  await db.collection(PRICE_TICKS).createIndex({ event_id: 1, updated_at: 1 });
  await db.collection("olbors_quotes").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection("olbors_quotes").createIndex({ id: 1 }, { unique: true });
}

// One atomic compare-and-swap commits purchase, stock, prices and history together.
// Works on the existing standalone MongoDB, without requiring a replica set.
export async function mutateExchange(db, id, action) {
  const c = db.collection(EXCHANGES);
  for (let attempt = 0; attempt < 20; attempt++) {
    const d = await c.findOne({ id });
    if (!d) fail(404, "Børsen finnes ikke.");
    const version = d.version;
    const result = await action(d);
    d.version++;
    if (BSON.calculateObjectSize(d) > 14 * 1024 * 1024)
      fail(409, "Børsen har nådd lagringsgrensen. Opprett en ny børs.");
    const saved = await c.replaceOne({ id, version }, d);
    if (saved.modifiedCount) {
      publishChange(id, d.version, d.kioskToken);
      return result;
    }
  }
  fail(409, "Børsen er opptatt. Prøv igjen.");
}

export async function tickOlborsMarkets({ getDatabase, now = Date.now(), random = Math.random }) {
  const db = await getDatabase();
  for (const candidate of await db.collection(EXCHANGES).find({ status: "live" }).toArray()) {
    if (marketClockDue(candidate, now)) await mutateExchange(db, candidate.id, (d) => advanceMarketClock(d, now, random));
    if (offerClockDue(candidate, now)) await mutateExchange(db, candidate.id, (d) => advanceOfferClock(d, now, random));
    const d = await db.collection(EXCHANGES).findOne({ id: candidate.id });
    if (!d || d.status !== "live") continue;
    const inserted = await db.collection(PRICE_TICKS).updateOne({ event_id: d.id, sample_bucket: Math.floor(now / 30000) }, { $setOnInsert: { updated_at: new Date(now).toISOString(), version: d.version, prices: d.beers.map((b) => ({ id: b.id, price: b.current_price })) } }, { upsert: true });
    if (inserted.upsertedCount) publishChange(d.id, d.version, d.kioskToken);
  }
}
export function startOlborsMarketWorker({ getDatabase }) {
  let running = false, stopped = false;
  const run = async () => {
    if (running || stopped) return;
    running = true;
    try { await tickOlborsMarkets({ getDatabase }); }
    catch (error) { console.warn("[Ølbørs] Market clock/history failed:", error.message); }
    finally { running = false; }
  };
  const timer = setInterval(() => void run(), 5000);
  timer.unref(); void run();
  return () => { stopped = true; clearInterval(timer); };
}

async function snapshot(d, user, kiosk = false, db) {
  const uids = d.customers.filter((c) => c.uid != null && !c.merged_into).map((c) => c.uid);
  const avatars = new Map((await db.collection("users").find({ uid: { $in: uids } }).project({ uid: 1, avatarUpdatedAt: 1 }).toArray()).map((u) => [u.uid, u.avatarUpdatedAt ?? 0]));
  const boundary = new Date(Date.now() - 3600000).toISOString();
  const [lastTick, hourTick] = await Promise.all([
    db.collection(PRICE_TICKS).findOne({ event_id: d.id }, { sort: { updated_at: -1 } }),
    db.collection(PRICE_TICKS).findOne({ event_id: d.id, updated_at: { $lte: boundary } }, { sort: { updated_at: -1 } }),
  ]);
  const beers = d.beers.map((b) => {
    const h = d.priceUpdates.filter(
      (p) =>
        p.event_beer_id === b.id &&
        Date.parse(p.updated_at) >= Date.now() - 3600000,
    );
    const before = d.priceUpdates.filter((p) => p.event_beer_id === b.id && p.updated_at <= boundary).at(-1);
    const anchor = before && (!hourTick || before.updated_at >= hourTick.updated_at) ? before.new_price : hourTick?.prices.find((p) => p.id === b.id)?.price;
    return {
      ...b,
      last_hours_change: b.current_price - (anchor ?? h[0]?.old_price ?? b.current_price),
    };
  });
  const customers = d.customers
    .filter((c) => !c.merged_into)
    .map((c) => {
      const metrics = customerAnalytics(d, c);
      const publicCustomer = {
        id: c.id,
        uid: c.uid,
        avatarUpdatedAt: avatars.get(c.uid) ?? 0,
        name: c.name,
        profile_image_url: c.profile_image_url,
        ...metrics,
      };
      return !kiosk && user && c.uid === user.uid
        ? { ...c, ...publicCustomer, missingProfileFields: missingProfileFields(c, checkoutSettings(d.checkoutSettings)) }
        : publicCustomer;
    });
  const transactions = d.transactions
    .slice(-100)
    .reverse()
    .map((t) => ({
      ...t,
      customer_name: customers.find((c) => c.id === t.customer_id)?.name,
      beer_name: beers.find((b) => b.id === t.event_beer_id)?.name,
    }));
  const event = {
    id: d.id,
    name: d.name,
    currency: d.currency,
    status: d.status,
    image_url: d.image_url,
    starts_at: d.starts_at,
    ends_at: d.ends_at,
    adminUids: kiosk ? [] : d.adminUids,
    version: d.version,
    maxUnitsPerPurchase: d.maxUnitsPerPurchase ?? 1,
    marketEvent: d.marketEvent ?? null,
    checkoutRevision: checkoutHash(checkoutSettings(d.checkoutSettings)),
    superOffer: d.superOffer ? { id: d.superOffer.id, beerId: d.superOffer.beerId, price: d.superOffer.price, remainingPurchases: d.superOffer.remainingPurchases, ends_at: d.superOffer.ends_at } : null,
    ...(user && isAdmin(d, user) ? { checkoutSettings: checkoutSettings(d.checkoutSettings), offerSettings: offerSettings(d.offerSettings) } : {}),
    historySampleAt: lastTick?.updated_at ?? null,
    ...(user && isAdmin(d, user) ? { marketSettings: marketSettings(d.marketSettings) } : {}),
    ...(user && isAdmin(d, user) ? { pricingSettings: pricingSettings(d.pricingSettings), house: { ...houseMetrics(d.beers, d.transactions), emergency: Boolean(d.pricingState?.emergency) } } : {}),
  };
  return {
    event,
    beers,
    customers,
    transactions,
    isAdmin: user ? isAdmin(d, user) : false,
    myCustomerId: user ? d.customers.find((c) => c.uid === user.uid)?.id : null,
    summary: d.status === "closed"
      ? { ...exchangeSummary(d, user ? d.customers.find((c) => c.uid === user.uid && !c.merged_into)?.id : null), customers: customers.map((c) => ({ ...c, quantity: c.drinks, variety: new Set(d.transactions.filter((t) => t.customer_id === c.id).map((t) => t.event_beer_id)).size })) }
      : null,
  };
}

export function registerOlborsPublicRoutes(app, { getDatabase, resolveUser }) {
  app.get(["/olbors/:id/stream", "/olbors/stream/:id"], async (req, res) => {
    try {
      const db = await getDatabase(),
        d = await db.collection(EXCHANGES).findOne({ id: req.params.id });
      if (!d) return res.status(404).json({ error: "Børsen finnes ikke." });
      if (req.query.key) {
        if (d.kioskToken !== req.query.key)
          return res.status(401).json({ error: "Ugyldig kiosklenke." });
      } else {
        if (!req.query.token || !resolveUser) return res.sendStatus(401);
        await resolveUser(String(req.query.token));
      }
      res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      res.locals.kioskKey = req.query.key ? String(req.query.key) : null;
      const set = liveClients.get(d.id) ?? new Set();
      liveClients.set(d.id, set);
      set.add(res);
      res.write(
        `event: ready\ndata: ${JSON.stringify({ version: d.version })}\n\n`,
      );
      const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25000);
      req.on("close", () => {
        clearInterval(heartbeat);
        set.delete(res);
        if (!set.size) liveClients.delete(d.id);
      });
    } catch (e) {
      res
        .status(e.name === "UnauthorizedError" ? 401 : 503)
        .json({ error: "Kunne ikke koble til sanntidsoppdateringer." });
    }
  });
  app.get("/olbors/kiosk/:id", async (req, res) => {
    const db = await getDatabase();
    const d = await db
      .collection(EXCHANGES)
      .findOne({ id: req.params.id, kioskToken: String(req.query.key ?? "") });
    if (!d) return res.status(404).json({ error: "Ugyldig kiosklenke." });
    res.set("Cache-Control", "no-store").json(await snapshot(d, null, true, db));
  });
}

export function registerOlborsRoutes(router, { getDatabase }) {
  const route = (method, path, fn) =>
    router[method](`/olbors${path}`, async (req, res) => {
      try {
        const db = await getDatabase();
        res.set("Cache-Control", "no-store").json(await fn(req, db));
      } catch (e) {
        if (!e.status) console.error("[Ølbørs]", e);
        res.status(e.status ?? 500).json({
          error: e.status ? e.message : "Kunne ikke behandle børsen.",
        });
      }
    });
  route("get", "", async (req, db) =>
    (
      await db
        .collection(EXCHANGES)
        .find(
          {},
          {
            projection: {
              id: 1,
              name: 1,
              status: 1,
              currency: 1,
              image_url: 1,
              created_at: 1,
              adminUids: 1,
            },
          },
        )
        .sort({ created_at: -1 })
        .toArray()
    ).map(clean),
  );
  route("post", "", async (req, db) => {
    const name = String(req.body.name ?? "")
      .trim()
      .slice(0, 150);
    if (!name) fail(400, "Navn mangler.");
    const d = {
      id: randomUUID(),
      name,
      currency: "NOK",
      status: "draft",
      created_at: new Date().toISOString(),
      starts_at: null,
      ends_at: null,
      image_url: null,
      creatorUid: req.currentUser.uid,
      adminUids: [req.currentUser.uid],
      maxUnitsPerPurchase: 1,
      kioskToken: randomUUID(),
      version: 0,
      beers: [],
      customers: [],
      transactions: [],
      priceUpdates: [],
    };
    await db.collection(EXCHANGES).insertOne(d);
    return clean(d);
  });
  route("delete", "/:id", async (req, db) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const d = await db.collection(EXCHANGES).findOne({ id: req.params.id });
      if (!d) fail(404, "Børsen finnes ikke.");
      if (!isAdmin(d, req.currentUser)) fail(403, "Kun børsadministrator kan slette børsen.");
      const deleted = await db.collection(EXCHANGES).deleteOne({ id: d.id, version: d.version });
      if (!deleted.deletedCount) continue;
      publishChange(d.id, d.version + 1, d.kioskToken);
      for (const res of liveClients.get(d.id) ?? []) res.end();
      liveClients.delete(d.id);
      await db.collection(PRICE_TICKS).deleteMany({ event_id: d.id });
      await db.collection("olbors_quotes").deleteMany({ eventId: d.id });
      return { deleted: true };
    }
    fail(409, "Børsen er opptatt. Prøv igjen.");
  });
  route("get", "/:id", async (req, db) => {
    const d = await db.collection(EXCHANGES).findOne({ id: req.params.id });
    if (!d) fail(404, "Børsen finnes ikke.");
    return snapshot(d, req.currentUser, false, db);
  });
  route("get", "/:id/transactions", async (req, db) => {
    const d = await db.collection(EXCHANGES).findOne({ id: req.params.id });
    if (!d) fail(404, "Børsen finnes ikke.");
    const offset = number(req.query.offset ?? 0, 0, Number.MAX_SAFE_INTEGER),
      limit = number(req.query.limit ?? 100, 1, 500);
    const rows = d.transactions
      .filter(
        (t) =>
          (!req.query.customerId || t.customer_id === req.query.customerId) &&
          (!req.query.beerId || t.event_beer_id === req.query.beerId),
      )
      .reverse();
    return {
      total: rows.length,
      items: rows.slice(offset, offset + limit).map((t) => ({
        ...t,
        customer_name: d.customers.find((c) => c.id === t.customer_id)?.name,
        beer_name: d.beers.find((b) => b.id === t.event_beer_id)?.name,
      })),
    };
  });
  route("post", "/:id/images", async (req, db) => {
    const d = await db.collection(EXCHANGES).findOne({ id: req.params.id });
    if (!d) fail(404, "Børsen finnes ikke.");
    const exchangeImage = req.body.purpose === "exchange";
    if (exchangeImage && !isAdmin(d, req.currentUser)) fail(403, "Kun administrator kan laste opp børsbilde.");
    if (
      !isAdmin(d, req.currentUser) &&
      !d.customers.some((c) => c.uid === req.currentUser.uid)
    )
      fail(403, "Bli med på børsen først.");
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
      String(req.body.dataUrl ?? ""),
    );
    if (!match) fail(400, "Bruk PNG, JPEG eller WebP.");
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length) fail(400, "Bildefilen er tom.");
    if (!exchangeImage && bytes.length > 5 * 1024 * 1024)
      fail(400, "Maksimal bildestørrelse er 5 MB.");
    const valid =
      match[1] === "png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : match[1] === "jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP";
    if (!valid) fail(400, "Ugyldig bildefil.");
    await mkdir(olborsMediaDir, { recursive: true });
    const filename = `${randomUUID()}.${match[1]}`;
    await writeFile(path.join(olborsMediaDir, filename), bytes, { flag: "wx" });
    return { url: `/olbors-media/${filename}` };
  });
  route("get", "/:id/kiosk-link", async (req, db) => {
    const d = await db.collection(EXCHANGES).findOne({ id: req.params.id });
    if (!d) fail(404, "Børsen finnes ikke.");
    if (!isAdmin(d, req.currentUser)) fail(403, "Kun administrator.");
    return { path: `/olbors/${d.id}/kiosk?key=${d.kioskToken}` };
  });
  route("put", "/:id", (req, db) =>
    mutateExchange(db, req.params.id, (d) => {
      if (!isAdmin(d, req.currentUser)) fail(403, "Kun administrator.");
      if (req.body.name !== undefined) {
        const n = String(req.body.name).trim();
        if (!n) fail(400, "Navn mangler.");
        d.name = n.slice(0, 150);
      }
      if (req.body.status !== undefined) {
        if (!["draft", "live", "closed"].includes(req.body.status))
          fail(400, "Ugyldig status.");
        if (req.body.status !== "live") { endSuperOffer(d, Date.now(), "exchange-closed"); endMarketEvent(d, Date.now(), "exchange-closed"); }
        d.status = req.body.status;
        if (d.status === "live") { d.starts_at ??= new Date().toISOString(); d.ends_at = null; logPrices(d, d.beers, Date.now(), "exchange-open"); }
        if (d.status === "closed") { d.ends_at = new Date().toISOString(); logPrices(d, d.beers, Date.now(), "exchange-closed"); }
      }
      if (req.body.rotateKiosk) d.kioskToken = randomUUID();
      if ("maxUnitsPerPurchase" in req.body) {
        const limit = req.body.maxUnitsPerPurchase;
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail(400, "Maks enheter per kjøp må være et heltall mellom 1 og 100.");
        d.maxUnitsPerPurchase = limit;
      }
      if ("image_url" in req.body) d.image_url = imageUrl(req.body.image_url);
      if ("pricingSettings" in req.body) {
        if (!req.body.pricingSettings || typeof req.body.pricingSettings !== "object" || Array.isArray(req.body.pricingSettings)) fail(400, "Ugyldige prisinnstillinger.");
        try { d.pricingSettings = pricingSettings({ ...pricingSettings(d.pricingSettings), ...req.body.pricingSettings }); }
        catch (e) { fail(400, e.message); }
        d.pricingState = { emergency: protectionActive(houseMetrics(d.beers, d.transactions), d.pricingSettings) };
      }
      if ("marketSettings" in req.body) {
        if (!req.body.marketSettings || typeof req.body.marketSettings !== "object" || Array.isArray(req.body.marketSettings)) fail(400, "Ugyldige hendelsesinnstillinger.");
        try { d.marketSettings = marketSettings({ ...marketSettings(d.marketSettings), ...req.body.marketSettings }); }
        catch (e) { fail(400, e.message); }
        d.marketState = { ...d.marketState, nextRandomAt: Date.now() + d.marketSettings.randomIntervalMinutes * 60000 };
      }
      if ("checkoutSettings" in req.body) {
        try { d.checkoutSettings = checkoutSettings(req.body.checkoutSettings); } catch (e) { fail(400, e.message); }
      }
      if ("offerSettings" in req.body) {
        try { d.offerSettings = offerSettings(req.body.offerSettings); } catch (e) { fail(400, e.message); }
        if (!d.offerSettings.enabled) endSuperOffer(d, Date.now(), "disabled");
        d.offerState = { nextAt: Date.now() + d.offerSettings.intervalMinutes * 60000 };
      }
      return { ok: true };
    }),
  );
  route("post", "/:id/market-events", (req, db) => mutateExchange(db, req.params.id, (d) => {
    if (!isAdmin(d, req.currentUser)) fail(403, "Kun administrator.");
    try { startMarketEvent(d, req.body.type, Date.now(), `admin:${req.currentUser.uid}`, req.body); }
    catch (e) { fail(400, e.message); }
    return d.marketEvent;
  }));
  route("delete", "/:id/market-events/current", (req, db) => mutateExchange(db, req.params.id, (d) => {
    if (!isAdmin(d, req.currentUser)) fail(403, "Kun administrator.");
    endMarketEvent(d, Date.now(), "admin-stop"); return { ok: true };
  }));
  route("put", "/:id/roles", async (req, db) => {
    const uid = number(req.body.uid, 1, Number.MAX_SAFE_INTEGER);
    if (!(await db.collection("users").findOne({ uid })))
      fail(400, "Brukeren finnes ikke.");
    return mutateExchange(db, req.params.id, (d) => {
      if (!isAdmin(d, req.currentUser)) fail(403, "Kun administrator.");
      if (!["admin", "regular"].includes(req.body.role))
        fail(400, "Ugyldig rolle.");
      const set = new Set(d.adminUids);
      req.body.role === "admin" ? set.add(uid) : set.delete(uid);
      if (!set.size) fail(409, "Børsen må ha minst én administrator.");
      d.adminUids = [...set];
      return { ok: true };
    });
  });
  route("post", "/:id/join", (req, db) =>
    mutateExchange(db, req.params.id, (d) => {
      let c = d.customers.find((c) => c.uid === req.currentUser.uid);
      if (!c) {
        c = {
          id: randomUUID(),
          event_id: d.id,
          uid: req.currentUser.uid,
          name: req.currentUser.name,
        };
        d.customers.push(c);
      }
      return c;
    }),
  );
  route("post", "/:id/members", async (req, db) => {
    const uid = number(req.body.uid, 1, Number.MAX_SAFE_INTEGER),
      u = await db.collection("users").findOne({ uid });
    if (!u) fail(400, "Brukeren må først logge inn i Gnomguttan.");
    return mutateExchange(db, req.params.id, (d) => {
      if (!isAdmin(d, req.currentUser)) fail(403, "Kun administrator.");
      let c = d.customers.find((c) => c.uid === uid);
      if (!c) {
        c = { id: randomUUID(), event_id: d.id, uid, name: u.name };
        d.customers.push(c);
      }
      return c;
    });
  });
  route("put", "/:id/customers/:customerId", async (req, db) => {
    if (
      req.body.uid != null &&
      !(await db.collection("users").findOne({ uid: Number(req.body.uid) }))
    )
      fail(400, "Brukeren finnes ikke.");
    return mutateExchange(db, req.params.id, (d) => {
      const c = d.customers.find((c) => c.id === req.params.customerId);
      if (!c) fail(404, "Kunden finnes ikke.");
      const admin = isAdmin(d, req.currentUser);
      if (!admin && c.uid !== req.currentUser.uid) fail(403, "Ingen tilgang.");
      if (c.uid !== req.currentUser.uid && PROFILE_FIELDS.some((field) => field in req.body))
        fail(403, "Du kan bare redigere din egen profil.");
      if ("uid" in req.body) {
        if (!admin) fail(403, "Kun administrator kan koble kunder.");
        const uid =
          req.body.uid == null
            ? null
            : number(req.body.uid, 1, Number.MAX_SAFE_INTEGER);
        const other =
          uid === null
            ? null
            : d.customers.find(
                (other) => other.id !== c.id && other.uid === uid,
              );
        if (other) {
          if (req.body.merge !== true)
            fail(409, "Brukeren er allerede koblet til en kunde.");
          for (const tx of d.transactions)
            if (tx.customer_id === other.id) {
              tx.original_customer_id ??= other.id;
              tx.customer_id = c.id;
            }
          other.uid = null;
          other.merged_into = c.id;
        }
        c.uid = uid;
      }
      for (const key of PROFILE_FIELDS)
        if (key in req.body)
          c[key] =
            key === "profile_image_url"
              ? imageUrl(req.body[key])
              : String(req.body[key]).slice(0, 500);
      return { ok: true };
    });
  });
  const saveBeer = (req, db) =>
    mutateExchange(db, req.params.id, (d) => {
      if (!isAdmin(d, req.currentUser)) fail(403, "Kun administrator.");
      let b = req.params.beerId
        ? d.beers.find((b) => b.id === req.params.beerId)
        : null;
      if (req.params.beerId && !b) fail(404, "Ølet finnes ikke.");
      const beforePrices = d.beers.map((beer) => ({ ...beer }));
      const values = { ...b, current_price: b?.normal_price ?? b?.current_price, ...req.body };
      const n = String(values.name ?? "").trim();
      if (!n) fail(400, "Navn mangler.");
      const min = number(values.min_price, -100000, 100000),
        max = number(values.max_price, min, 100000);
      const base = number(values.base_price, min, max),
        current = number(values.current_price ?? base, min, max);
      const volumes = values.volumes;
      if (!Array.isArray(volumes) || !volumes.length || volumes.length > 20)
        fail(400, "Legg til serveringsvolum.");
      const v = volumes.map((v) => ({
        volume_ml: number(v.volume_ml ?? v.ml, 1, 10000),
        ...(v.stock == null ? {} : { stock: number(v.stock, 0, 1000000) }),
      }));
      if (
        new Set(v.map((v) => v.volume_ml)).size !== v.length ||
        v.some((v) => v.stock != null && !Number.isInteger(v.stock))
      )
        fail(400, "Ugyldig volum eller lager.");
      const updated = {
        id: b?.id ?? randomUUID(),
        event_id: d.id,
        name: n.slice(0, 150),
        ...(values.cost_price == null ? {} : { cost_price: number(values.cost_price, 0, 100000) }),
        base_price: base,
        min_price: min,
        max_price: max,
        current_price: current,
        volumes: v,
        abv: number(values.abv ?? 4.5, 0, 100),
        ibu: number(values.ibu ?? 0, 0, 1000),
        position: number(values.position ?? 0, 0, 100000),
        active: values.active !== false && values.active !== 0,
      };
      for (const key of ["brewery", "style", "description", "image_url"])
        updated[key] =
          key === "image_url"
            ? imageUrl(values[key])
            : String(values[key] ?? "").slice(0, 2000);
      if (b) {
        Object.assign(b, updated);
        if (req.body.cost_price === null) delete b.cost_price;
      } else d.beers.push(updated);
      if (d.marketEvent) (b ?? updated).normal_price = current;
      applyMarketPrices(d, normalPrices(d));
      logPrices(d, beforePrices, Date.now(), "beer-edit");
      return d.beers.find((beer) => beer.id === updated.id);
    });
  route("post", "/:id/beers", saveBeer);
  route("put", "/:id/beers/:beerId", saveBeer);
  route("get", "/:id/beers/:beerId/history", async (req, db) => {
    const d = await db.collection(EXCHANGES).findOne({ id: req.params.id });
    if (!d) fail(404, "Børsen finnes ikke.");
    const ticks = await db.collection(PRICE_TICKS).find({ event_id: d.id }).sort({ updated_at: 1 }).toArray();
    return [
      ...d.priceUpdates.filter((p) => p.event_beer_id === req.params.beerId),
      ...ticks.flatMap((tick) => { const price = tick.prices.find((p) => p.id === req.params.beerId); return price ? [{ event_beer_id: price.id, old_price: price.price, new_price: price.price, updated_at: tick.updated_at, reason: "sample" }] : []; }),
    ].sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  });
  route("get", "/:id/beers/:beerId/stats", async (req, db) => {
    const d = await db.collection(EXCHANGES).findOne({ id: req.params.id });
    if (!d) fail(404, "Børsen finnes ikke.");
    const b = d.beers.find((b) => b.id === req.params.beerId);
    if (!b) fail(404, "Ølet finnes ikke.");
    return beerAnalytics(d, b);
  });
  route("post", "/:id/super-offer", (req, db) => mutateExchange(db, req.params.id, (d) => {
    if (!isAdmin(d, req.currentUser)) fail(403, "Kun administrator.");
    try { if (!startSuperOffer(d)) fail(400, "Ingen øl er tilgjengelige for supertilbud."); } catch (e) { fail(e.status ?? 400, e.message); }
    return { ok: true };
  }));
  route("delete", "/:id/super-offer", (req, db) => mutateExchange(db, req.params.id, (d) => {
    if (!isAdmin(d, req.currentUser)) fail(403, "Kun administrator.");
    endSuperOffer(d, Date.now(), "admin"); return { ok: true };
  }));
  route("post", "/:id/quote", async (req, db) => {
    const d = await db.collection(EXCHANGES).findOne({ id: req.params.id });
    if (!d || d.status !== "live") fail(409, "Børsen er ikke åpen.");
    const c = d.customers.find((c) => c.uid === req.currentUser.uid && !c.merged_into);
    if (!c) fail(403, "Bli med på børsen først.");
    if (missingProfileFields(c, checkoutSettings(d.checkoutSettings)).length) fail(422, "Fyll ut profilen din før du kjøper øl.");
    const b = d.beers.find((b) => b.id === req.body.beerId && b.active);
    const qty = number(req.body.qty, 1, d.maxUnitsPerPurchase ?? 1), volume = number(req.body.volume_ml, 1, 10000);
    if (!b || !Number.isInteger(qty) || !b.volumes.some((v) => v.volume_ml === volume)) fail(400, "Ugyldig kjøp.");
    const quote = checkoutQuote(d, c, b, qty, volume);
    const stored = { ...quote, id: randomUUID(), eventId: d.id, uid: req.currentUser.uid, beerId: b.id, qty, volume, expectedPrice: b.current_price,
      configHash: checkoutHash(checkoutSettings(d.checkoutSettings)), profileHash: checkoutHash(PROFILE_FIELDS.map((field) => c[field] ?? "")), expiresAt: new Date(Date.now() + 120000) };
    await db.collection("olbors_quotes").insertOne(stored);
    return { ...quote, id: stored.id, expectedPrice: b.current_price, expiresAt: stored.expiresAt };
  });
  route("post", "/:id/purchases", async (req, db) => {
    const observed = await db.collection(EXCHANGES).findOne({ id: req.params.id });
    if (observed?.marketEvent && Date.parse(observed.marketEvent.ends_at) <= Date.now()) await mutateExchange(db, req.params.id, (d) => {
      if (d.marketEvent && Date.parse(d.marketEvent.ends_at) <= Date.now()) endMarketEvent(d, Date.now());
    });
    if (observed?.superOffer && Date.parse(observed.superOffer.ends_at) <= Date.now()) await mutateExchange(db, req.params.id, (d) => {
      if (d.superOffer && Date.parse(d.superOffer.ends_at) <= Date.now()) endSuperOffer(d, Date.now(), "expired");
    });
    const quote = req.body.quoteId ? await db.collection("olbors_quotes").findOne({ id: String(req.body.quoteId), eventId: req.params.id, uid: req.currentUser.uid }) : null;
    const result = await mutateExchange(db, req.params.id, (d) => {
      if (d.status !== "live") fail(409, "Børsen er ikke åpen.");
      const key = String(req.body.requestId ?? "");
      if (!/^[\w-]{10,100}$/.test(key)) fail(400, "Kjøpsreferanse mangler.");
      const duplicate = d.transactions.find(
        (t) => t.requestId === key && t.uid === req.currentUser.uid,
      );
      if (duplicate) {
        if (
          duplicate.event_beer_id !== req.body.beerId ||
          duplicate.qty !== Number(req.body.qty) ||
          duplicate.volume_ml !== Number(req.body.volume_ml) ||
          (req.body.customerId != null && ![duplicate.customer_id, duplicate.original_customer_id].includes(
            req.body.customerId,
          ))
        )
          fail(
            409,
            "Kjøpsreferansen er allerede brukt. Lukk kjøpsvinduet og start et nytt kjøp.",
          );
        return duplicate;
      }
      const b = d.beers.find((b) => b.id === req.body.beerId && b.active);
      if (!b) fail(400, "Ølet er ikke tilgjengelig.");
      const qty = number(req.body.qty, 1, 100);
      if (!Number.isInteger(qty)) fail(400, "Antall må være et heltall.");
      if (qty > (d.maxUnitsPerPurchase ?? 1)) fail(400, `Maks ${d.maxUnitsPerPurchase ?? 1} enheter per kjøp på denne børsen.`);
      const volume = number(req.body.volume_ml, 1, 10000),
        v = b.volumes.find((v) => Number(v.volume_ml ?? v.ml) === volume);
      if (!v) fail(400, "Ugyldig serveringsvolum.");
      if (v.stock != null && v.stock < qty) fail(409, "Ikke nok på lager.");
      const c = d.customers.find((c) => c.uid === req.currentUser.uid && !c.merged_into);
      if (
        !c ||
        c.merged_into ||
        (req.body.customerId != null && c.id !== req.body.customerId)
      )
        fail(403, "Kunden er ikke koblet til din bruker.");
      const config = checkoutSettings(d.checkoutSettings);
      if (missingProfileFields(c, config).length) fail(422, "Fyll ut profilen din før du kjøper øl.");
      if (Number(req.body.expectedPrice) !== b.current_price)
        fail(409, "Prisen har endret seg. Kontroller ny pris og prøv igjen.");
      if (req.body.quoteId && (!quote || quote.expiresAt.getTime() <= Date.now() || quote.beerId !== b.id || quote.qty !== qty || quote.volume !== volume || quote.expectedPrice !== b.current_price || quote.configHash !== checkoutHash(config) || quote.profileHash !== checkoutHash(PROFILE_FIELDS.map((field) => c[field] ?? "")) || (quote.superOfferApplied && (d.superOffer?.id !== quote.superOfferId || d.superOffer.buyerUids.includes(c.uid))))) fail(409, "Pristilbudet har endret seg. Kontroller ny total og bekreft på nytt.");
      const cart = quote ?? checkoutQuote(d, c, b, qty, volume), total = cart.total;
      const settings = pricingSettings(d.pricingSettings),
        metrics = houseMetrics(d.beers, d.transactions),
        cost = referenceCost(b) * volume / 1000 * qty;
      if (quoteNeedsProtection(metrics, settings, total, cost)) {
        const previous = d.beers.map((beer) => ({ ...beer }));
        const protectedPrices = emergencyPrices(normalPrices(d), settings);
        if (!d.marketEvent && !d.superOffer && protectedPrices.every((price, index) => price.current_price === d.beers[index].current_price))
          fail(409, "Tapsvernet stopper dette kjøpet. Administrator må justere innkjøpspris eller makspris.");
        endSuperOffer(d, Date.now(), "house-protection");
        endMarketEvent(d, Date.now(), "house-protection");
        d.beers = protectedPrices;
        for (const beer of d.beers) delete beer.normal_price;
        logPrices(d, previous, Date.now(), "house-protection");
        d.pricingState = { emergency: true };
        return { requote: true };
      }
      const t = {
        id: randomUUID(),
        requestId: key,
        event_id: d.id,
        event_beer_id: b.id,
        customer_id: c.id,
        uid: req.currentUser.uid,
        qty,
        volume_ml: volume,
        abv: b.abv,
        unit_price: total,
        total_price: total,
        commission_fee: cart.commissionFee,
        adjustments: cart.adjustments,
        adjustment_percent: cart.adjustmentPercent,
        subtotal: cart.subtotal,
        super_offer_id: cart.superOfferId,
        cost_price_per_liter: referenceCost(b),
        cost_is_estimate: b.cost_price == null,
        created_at: new Date().toISOString(),
      };
      if (v.stock != null) v.stock -= qty;
      const beforePrices = d.beers.map((beer) => ({ ...beer }));
      d.transactions.push(t);
      if (cart.superOfferApplied && d.superOffer?.id === cart.superOfferId) {
        d.superOffer.buyerUids.push(c.uid); d.superOffer.remainingPurchases--;
        if (!d.superOffer.remainingPurchases) endSuperOffer(d, Date.parse(t.created_at), "sold");
      }
      d.pricingState = { emergency: protectionActive(houseMetrics(d.beers, d.transactions), settings, d.pricingState?.emergency) };
      if (d.pricingState.emergency) { endSuperOffer(d, Date.parse(t.created_at), "house-protection"); endMarketEvent(d, Date.parse(t.created_at), "house-protection"); }
      applyMarketPrices(d, recalculate(normalPrices(d), d.transactions, b.id, qty, { volumeMl: volume, settings, emergency: d.pricingState.emergency }));
      logPrices(d, beforePrices, Date.parse(t.created_at), "purchase");
      advanceMarketClock(d, Date.parse(t.created_at));
      return t;
    });
    if (result.requote) fail(409, "Tapsvernet har justert prisene. Kontroller den nye prisen og bekreft kjøpet på nytt.");
    return result;
  });
}
