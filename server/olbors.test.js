import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  registerOlborsRoutes,
  registerOlborsPublicRoutes,
  ensureOlborsIndexes,
  EXCHANGES,
  PRICE_TICKS,
  tickOlborsMarkets,
  olborsMediaDir,
} from "./olbors.js";
import { recalculate, pricingSettings, houseMetrics, emergencyPrices, protectionActive } from "./olbors-pricing.js";
import { beerAnalytics, customerAnalytics, exchangeSummary } from "./olbors-analytics.js";
import { marketSettings, startMarketEvent, endMarketEvent, advanceMarketClock, normalPrices, applyMarketPrices, profitEligible } from "./olbors-market.js";
import { checkoutSettings, checkoutQuote, missingProfileFields } from "./olbors-checkout.js";
import { offerSettings, startSuperOffer, endSuperOffer, advanceOfferClock } from "./olbors-offers.js";
const completeProfile = { weight: "75", height: "181", shoe_size: "42", gender: "male", work_relationship: "Student", marital_status: "Single" };

test("Ølbørs integration on standalone MongoDB", async (t) => {
  const memory = await MongoMemoryServer.create({
    instance: { launchTimeout: 60000 },
  });
  const client = new MongoClient(memory.getUri());
  await client.connect();
  const db = client.db("olbors-test");
  await ensureOlborsIndexes(db);
  await db.collection("users").insertMany([
    { uid: 1, name: "Owner" },
    { uid: 2, name: "Member" },
    { uid: 3, name: "Second admin" },
  ]);
  const app = express();
  app.post("/olbors/:id/images", express.json({ limit: Infinity }));
  app.use(express.json());
  registerOlborsPublicRoutes(app, {
    getDatabase: async () => db,
    resolveUser: async (token) => {
      if (!["test-only", "test-member"].includes(token))
        throw Object.assign(new Error("Invalid"), {
          name: "UnauthorizedError",
        });
      return { uid: token === "test-member" ? 2 : 1 };
    },
  });
  app.use((req, res, next) => {
    const uid = Number(req.get("X-Test-Uid"));
    if (!uid) return res.sendStatus(401);
    req.currentUser = { uid, name: `User ${uid}` };
    next();
  });
  registerOlborsRoutes(app, { getDatabase: async () => db });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, url, body, uid = 1) => {
    const r = await fetch(base + "/olbors" + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Test-Uid": String(uid),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, body: await r.json() };
  };
  try {
    const created = await request("POST", "", { name: "Test exchange" });
    const id = created.body.id;
    await t.test(
      "creator gets admin; ordinary users cannot manage beers or roles",
      async () => {
        assert.equal(created.status, 200);
        assert.deepEqual(created.body.adminUids, [1]);
        assert.equal(
          (await request("POST", `/${id}/beers`, {}, 2)).status,
          403,
        );
        assert.equal(
          (await request("PUT", `/${id}/roles`, { uid: 3, role: "admin" }, 2))
            .status,
          403,
        );
        assert.equal(
          (await request("PUT", `/${id}/roles`, { uid: 1, role: "regular" }))
            .status,
          409,
        );
        assert.equal(
          (await request("PUT", `/${id}/roles`, { uid: 3, role: "admin" }))
            .status,
          200,
        );
        assert.equal(
          (await request("PUT", `/${id}/roles`, { uid: 3, role: "regular" }))
            .status,
          200,
        );
      },
    );
    const customer = (await request("POST", `/${id}/join`, {}, 2)).body;
    await t.test(
      "admins add existing Gnomguttan users without creating duplicate customers",
      async () => {
        assert.equal(
          (await request("POST", `/${id}/members`, { uid: 3 }, 2)).status,
          403,
        );
        assert.equal(
          (await request("POST", `/${id}/members`, { uid: 999 })).status,
          400,
        );
        const joined = (await request("POST", `/${id}/members`, { uid: 2 }))
          .body;
        assert.equal(joined.id, customer.id);
      },
    );
    await t.test(
      "joining reuses the linked customer; customer rights and privacy",
      async () => {
        assert.equal(
          (await request("POST", `/${id}/join`, {}, 2)).body.id,
          customer.id,
        );
        assert.equal(
          (
            await request(
              "PUT",
              `/${id}/customers/${customer.id}`,
              { uid: 3 },
              2,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              "PUT",
              `/${id}/customers/${customer.id}`,
              { ...completeProfile, phone: "private" },
              2,
            )
          ).status,
          200,
        );
        const view = (await request("GET", `/${id}`, undefined, 3)).body;
        assert.equal((await request("PUT", `/${id}/customers/${customer.id}`, { weight: "99" }, 1)).status, 403);
        assert.equal((await request("GET", `/${id}`, undefined, 1)).body.customers.find((c) => c.id === customer.id).phone, undefined);
        assert.equal(view.customers[0].phone, undefined);
        assert.equal(view.event.kioskToken, undefined);
      },
    );
    const beerBody = {
      name: "Test beer",
      base_price: 100,
      min_price: 50,
      max_price: 150,
      abv: 5,
      volumes: [{ volume_ml: 500, stock: 10 }],
    };
    await t.test("exchange image uploads exceed both old limits and remain admin-only", async () => {
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6S8AAAAASUVORK5CYII=", "base64");
      const bytes = Buffer.concat([png, Buffer.alloc(16 * 1024 * 1024)]);
      const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
      assert.equal((await request("POST", `/${id}/images`, { dataUrl, purpose: "exchange" }, 2)).status, 403);
      assert.equal((await request("POST", `/${id}/images`, { dataUrl, purpose: "beer" })).status, 400);
      assert.equal((await request("POST", `/${id}/images`, { dataUrl: "data:image/png;base64,YmFk", purpose: "exchange" })).status, 400);
      const uploaded = await request("POST", `/${id}/images`, { dataUrl, purpose: "exchange" });
      assert.equal(uploaded.status, 200);
      assert.match(uploaded.body.url, /^\/olbors-media\/[\w-]+\.png$/);
      const filename = path.join(olborsMediaDir, path.basename(uploaded.body.url));
      try {
        assert.deepEqual(await readFile(filename), bytes);
        assert.equal((await request("PUT", `/${id}`, { image_url: uploaded.body.url })).status, 200);
      } finally { await unlink(filename); }
    });
    const beer = (await request("POST", `/${id}/beers`, beerBody)).body;
    await t.test("purchase quantity defaults to one and admins can change the enforced limit", async () => {
      const event = (await request("POST", "", { name: "Quantity limit" })).body;
      const buyer = (await request("POST", `/${event.id}/join`, {}, 1)).body;
      await request("PUT", `/${event.id}/customers/${buyer.id}`, completeProfile);
      const item = (await request("POST", `/${event.id}/beers`, beerBody)).body;
      await request("PUT", `/${event.id}`, { status: "live" });
      assert.equal((await request("GET", `/${event.id}`, undefined, 2)).body.event.maxUnitsPerPurchase, 1);
      const attempt = { beerId: item.id, customerId: buyer.id, qty: 2, volume_ml: 500, expectedPrice: 100, requestId: "quantity-limit-purchase" };
      assert.equal((await request("POST", `/${event.id}/purchases`, attempt)).status, 400);
      let saved = await db.collection(EXCHANGES).findOne({ id: event.id });
      assert.equal(saved.transactions.length, 0);
      assert.equal(saved.beers[0].volumes[0].stock, 10);
      assert.equal((await request("PUT", `/${event.id}`, { maxUnitsPerPurchase: 2 }, 2)).status, 403);
      for (const invalid of [0, -1, 101, 1.5, "2", null]) assert.equal((await request("PUT", `/${event.id}`, { maxUnitsPerPurchase: invalid })).status, 400);
      assert.equal((await request("PUT", `/${event.id}`, { maxUnitsPerPurchase: 2 })).status, 200);
      const receipt = await request("POST", `/${event.id}/purchases`, attempt);
      assert.equal(receipt.status, 200);
      await request("PUT", `/${event.id}`, { maxUnitsPerPurchase: 1 });
      assert.equal((await request("POST", `/${event.id}/purchases`, attempt)).body.id, receipt.body.id);
      saved = await db.collection(EXCHANGES).findOne({ id: event.id });
      assert.equal((await request("POST", `/${event.id}/purchases`, { ...attempt, requestId: "quantity-new-purchase", expectedPrice: saved.beers[0].current_price })).status, 400);
      assert.equal(saved.transactions.length, 1);
      // Imported exchanges without the new field also default to one.
      await db.collection(EXCHANGES).updateOne({ id: event.id }, { $unset: { maxUnitsPerPurchase: "" } });
      assert.equal((await request("GET", `/${event.id}`)).body.event.maxUnitsPerPurchase, 1);
    });
    await request("PUT", `/${id}`, { maxUnitsPerPurchase: 100, checkoutSettings: { fixedFee: 8 } });
    const purchase = {
      beerId: beer.id,
      customerId: customer.id,
      qty: 2,
      volume_ml: 500,
      expectedPrice: 100,
      requestId: "purchase-00001",
    };
    await t.test(
      "closed exchange rejects purchases; server calculates receipt and prevents duplicates",
      async () => {
        assert.equal(
          (await request("POST", `/${id}/purchases`, purchase, 2)).status,
          409,
        );
        await request("PUT", `/${id}`, { status: "live" });
        const receipt = await request(
          "POST",
          `/${id}/purchases`,
          { ...purchase, total_price: 0.01 },
          2,
        );
        assert.equal(receipt.status, 200);
        assert.equal(receipt.body.total_price, 108);
        const repeated = await request("POST", `/${id}/purchases`, purchase, 2);
        assert.equal(repeated.body.id, receipt.body.id);
        assert.equal(
          (
            await request(
              "POST",
              `/${id}/purchases`,
              { ...purchase, qty: 3 },
              2,
            )
          ).status,
          409,
        );
        const saved = await db.collection(EXCHANGES).findOne({ id });
        assert.equal(saved.transactions.length, 1);
        assert.equal(saved.beers[0].volumes[0].stock, 8);
        assert.equal(
          (
            await request(
              "POST",
              `/${id}/purchases`,
              { ...purchase, requestId: "purchase-00002" },
              3,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              "POST",
              `/${id}/purchases`,
              { ...purchase, requestId: "purchase-00003", qty: -2 },
              2,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(
              "POST",
              `/${id}/purchases`,
              { ...purchase, requestId: "purchase-00004", volume_ml: 330 },
              2,
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "concurrent purchases cannot oversell and commit history together",
      async () => {
        const fixed = (
          await request("POST", `/${id}/beers`, {
            ...beerBody,
            min_price: 100,
            max_price: 100,
            volumes: [{ volume_ml: 500, stock: 1 }],
          })
        ).body;
        const body = { ...purchase, qty: 1, beerId: fixed.id };
        const receipts = await Promise.all([
          request(
            "POST",
            `/${id}/purchases`,
            { ...body, requestId: "concurrent-0001" },
            2,
          ),
          request(
            "POST",
            `/${id}/purchases`,
            { ...body, requestId: "concurrent-0002" },
            2,
          ),
        ]);
        assert.deepEqual(receipts.map((r) => r.status).sort(), [200, 409]);
        const saved = await db.collection(EXCHANGES).findOne({ id });
        assert.equal(
          saved.beers.find((b) => b.id === fixed.id).volumes[0].stock,
          0,
        );
        assert.equal(
          saved.transactions.filter((t) => t.event_beer_id === fixed.id).length,
          1,
        );
      },
    );
    await t.test(
      "kiosk reads without login, hides private fields, token can be revoked",
      async () => {
        const link = (await request("GET", `/${id}/kiosk-link`)).body.path;
        const key = new URL(link, base).searchParams.get("key");
        const kiosk = await fetch(`${base}/olbors/kiosk/${id}?key=${key}`);
        assert.equal(kiosk.status, 200);
        const d = await kiosk.json();
        assert.equal(d.customers[0].phone, undefined);
        assert.equal(d.isAdmin, false);
        assert.equal(d.event.kioskToken, undefined);
        await request("PUT", `/${id}`, { rotateKiosk: true });
        assert.equal(
          (await fetch(`${base}/olbors/kiosk/${id}?key=${key}`)).status,
          404,
        );
        assert.equal(
          (await request("GET", `/${id}/kiosk-link`, undefined, 2)).status,
          403,
        );
      },
    );
    await t.test(
      "complete history is paginated and scoped to exchange and customer",
      async () => {
        const history = (
          await request(
            "GET",
            `/${id}/transactions?limit=1&customerId=${customer.id}`,
          )
        ).body;
        assert.equal(history.total, 2);
        assert.equal(history.items.length, 1);
        assert.equal(
          (await request("GET", `/${id}/transactions?limit=1&offset=1`)).body
            .items.length,
          1,
        );
        assert.equal(
          (await request("GET", `/${id}/beers/${beer.id}/history`)).status,
          200,
        );
        const stats = (await request("GET", `/${id}/beers/${beer.id}/stats`))
          .body;
        assert.equal(stats.quantity, 2);
        assert.equal(stats.liters, 1);
        assert.equal(stats.revenue, 108);
      },
    );
    await t.test(
      "live stream requires authentication and publishes committed updates",
      async () => {
        assert.equal((await fetch(`${base}/olbors/${id}/stream`)).status, 401);
        assert.equal(
          (await fetch(`${base}/olbors/${id}/stream?token=invalid`)).status,
          401,
        );
        const controller = new AbortController();
        const response = await fetch(
          `${base}/olbors/${id}/stream?token=test-only`,
          { signal: controller.signal },
        );
        assert.equal(response.status, 200);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        assert.match(
          decoder.decode((await reader.read()).value),
          /event: ready/,
        );
        await request("PUT", `/${id}`, { name: "Updated exchange" });
        const message = decoder.decode((await reader.read()).value);
        assert.match(message, /event: change/);
        assert.match(message, /version/);
        controller.abort();
        await reader.cancel().catch(() => {});
      },
    );
    await t.test(
      "legacy records can be linked without changing purchase IDs",
      async () => {
        await db.collection(EXCHANGES).updateOne(
          { id },
          {
            $push: {
              customers: { id: "legacy-customer", name: "Legacy", uid: null },
            },
          },
        );
        assert.equal(
          (await request("PUT", `/${id}/customers/legacy-customer`, { uid: 2 }))
            .status,
          409,
        );
        assert.equal(
          (await request("PUT", `/${id}/customers/legacy-customer`, { uid: 3 }))
            .status,
          200,
        );
        assert.equal(
          (await request("POST", `/${id}/join`, {}, 3)).body.id,
          "legacy-customer",
        );
        await db.collection(EXCHANGES).updateOne(
          { id },
          {
            $push: {
              customers: {
                id: "legacy-two",
                name: "Older customer",
                uid: null,
              },
            },
          },
        );
        const previous = await db.collection(EXCHANGES).findOne({ id });
        assert.equal(
          (
            await request("PUT", `/${id}/customers/legacy-two`, {
              uid: 2,
              merge: true,
            })
          ).status,
          200,
        );
        const merged = await db.collection(EXCHANGES).findOne({ id });
        assert.deepEqual(
          merged.transactions.map((t) => t.id),
          previous.transactions.map((t) => t.id),
        );
        assert.equal(merged.transactions[0].customer_id, "legacy-two");
        assert.equal(merged.transactions[0].original_customer_id, customer.id);
        assert.equal(
          (await request("POST", `/${id}/join`, {}, 2)).body.id,
          "legacy-two",
        );
      },
    );
    await t.test("admin pricing controls and loss protection commit a new quote without a sale", async () => {
      const event = (await request("POST", "", { name: "Risk test" })).body;
      const buyer = (await request("POST", `/${event.id}/join`, {}, 1)).body;
      await request("PUT", `/${event.id}/customers/${buyer.id}`, completeProfile);
      const riskBeer = (await request("POST", `/${event.id}/beers`, { ...beerBody, cost_price: 100, current_price: 20, min_price: 20, max_price: 200, volumes: [{ volume_ml: 500, stock: 100 }] })).body;
      assert.equal((await request("PUT", `/${event.id}`, { pricingSettings: { lossLimit: 10 } }, 2)).status, 403);
      for (const invalid of [null, [], { lossLimit: -1 }, { aggressionPercent: 50 }, { unknown: 1 }, { houseProtection: "yes" }]) assert.equal((await request("PUT", `/${event.id}`, { pricingSettings: invalid })).status, 400);
      assert.equal((await request("PUT", `/${event.id}`, { status: "live", maxUnitsPerPurchase: 10, pricingSettings: { lossLimit: 10 } })).status, 200);
      const ordinary = (await request("GET", `/${event.id}`, undefined, 2)).body;
      assert.equal(ordinary.event.house, undefined);
      const attempt = { beerId: riskBeer.id, customerId: buyer.id, qty: 1, volume_ml: 500, expectedPrice: 20, requestId: "risk-purchase-1" };
      const guarded = await Promise.all([
        request("POST", `/${event.id}/purchases`, attempt),
        request("POST", `/${event.id}/purchases`, { ...attempt, requestId: "risk-concurrent" }),
      ]);
      assert.ok(guarded.every((response) => response.status === 409));
      let saved = await db.collection(EXCHANGES).findOne({ id: event.id });
      assert.equal(saved.transactions.length, 0);
      assert.equal(saved.beers[0].volumes[0].stock, 100);
      assert.equal(saved.beers[0].current_price, 110);
      assert.ok(saved.priceUpdates.some((point) => point.reason === "house-protection"));
      const receipt = await request("POST", `/${event.id}/purchases`, { ...attempt, expectedPrice: 110 });
      assert.equal(receipt.status, 200);
      assert.equal(receipt.body.cost_price_per_liter, 100);
      assert.equal(receipt.body.cost_is_estimate, false);
      assert.equal((await request("POST", `/${event.id}/purchases`, { ...attempt, expectedPrice: 110 })).body.id, receipt.body.id);
      await request("POST", `/${event.id}/market-events`, { type: "crash", percent: 50 });
      const during = await db.collection(EXCHANGES).findOne({ id: event.id });
      assert.equal((await request("POST", `/${event.id}/purchases`, { ...attempt, qty: 10, expectedPrice: during.beers[0].current_price, requestId: "crash-risk-guard" })).status, 409);
      const protectedCrash = await db.collection(EXCHANGES).findOne({ id: event.id });
      assert.equal(protectedCrash.marketEvent, null);
      assert.equal(protectedCrash.transactions.length, 1);
      assert.ok(protectedCrash.priceUpdates.some((point) => point.reason === "market-end-house-protection"));
      await request("PUT", `/${event.id}/beers/${riskBeer.id}`, { base_price: 20, current_price: 20, min_price: 20, max_price: 20 });
      assert.equal((await request("POST", `/${event.id}/purchases`, { ...attempt, requestId: "risk-purchase-2" })).status, 409);
      await request("PUT", `/${event.id}`, { pricingSettings: { houseProtection: false } });
      assert.equal((await request("POST", `/${event.id}/purchases`, { ...attempt, requestId: "risk-purchase-2" })).status, 200);
      saved = await db.collection(EXCHANGES).findOne({ id: event.id });
      assert.equal(saved.transactions.length, 2);
      assert.equal(houseMetrics(saved.beers, saved.transactions).balance, -35);
    });
    await t.test("market events are scoped to admins, survive purchases, expire and record every beer", async () => {
      const event = (await request("POST", "", { name: "Timed market" })).body;
      const buyer = (await request("POST", `/${event.id}/join`)).body;
      await request("PUT", `/${event.id}/customers/${buyer.id}`, completeProfile);
      for (let i = 0; i < 6; i++) await request("POST", `/${event.id}/beers`, { ...beerBody, name: `Beer ${i}`, cost_price: 50, volumes: [{ volume_ml: 500 }] });
      await request("PUT", `/${event.id}`, { status: "live" });
      assert.equal((await request("POST", `/${event.id}/market-events`, { type: "crash" }, 2)).status, 403);
      assert.equal((await request("PUT", `/${event.id}`, { marketSettings: { crashPercent: 100 } })).status, 400);
      assert.equal((await request("POST", `/${event.id}/market-events`, { type: "crash", percent: 35, durationSeconds: 10 })).status, 200);
      let d = await db.collection(EXCHANGES).findOne({ id: event.id });
      assert.ok(d.beers.every((b) => b.current_price === 65 && b.normal_price === 100));
      const first = d.beers[0];
      assert.equal((await request("POST", `/${event.id}/purchases`, { beerId: first.id, customerId: buyer.id, qty: 1, volume_ml: 500, expectedPrice: 65, requestId: "during-crash-1" })).status, 200);
      d = await db.collection(EXCHANGES).findOne({ id: event.id });
      const nextNormal = d.beers[0].normal_price;
      assert.ok(nextNormal > 100);
      assert.equal(d.priceUpdates.filter((p) => p.reason === "purchase").length, 6);
      const expiry = Date.parse(d.marketEvent.ends_at);
      await tickOlborsMarkets({ getDatabase: async () => db, now: expiry + 1 });
      d = await db.collection(EXCHANGES).findOne({ id: event.id });
      assert.equal(d.marketEvent, null);
      assert.equal(d.beers[0].current_price, nextNormal);
      assert.ok(d.beers.every((b) => b.normal_price == null));
      await Promise.all([tickOlborsMarkets({ getDatabase: async () => db, now: expiry + 30001 }), tickOlborsMarkets({ getDatabase: async () => db, now: expiry + 30001 })]);
      const ticks = await db.collection(PRICE_TICKS).find({ event_id: event.id }).toArray();
      assert.equal(ticks.length, 2);
      assert.ok(ticks.every((tick) => tick.prices.length === 6));
      const history = (await request("GET", `/${event.id}/beers/${first.id}/history`)).body;
      assert.ok(history.some((point) => point.reason === "sample"));
      assert.ok(history.some((point) => point.reason === "market-crash-start"));
      assert.ok(history.some((point) => point.reason === "market-end-expired"));
      assert.ok(history.every((point, index) => !index || point.updated_at >= history[index - 1].updated_at));
      assert.equal((await request("POST", `/${event.id}/market-events`, { type: "surge", percent: 25 })).status, 200);
      assert.equal((await request("DELETE", `/${event.id}/market-events/current`, undefined, 2)).status, 403);
      assert.equal((await request("DELETE", `/${event.id}/market-events/current`)).status, 200);
      await request("POST", `/${event.id}/market-events`, { type: "crash" });
      await request("PUT", `/${event.id}`, { status: "closed" });
      d = await db.collection(EXCHANGES).findOne({ id: event.id });
      assert.equal(d.marketEvent, null);
    });
    await t.test("profile completion, own-account purchases and private fixed/profile commission quotes", async () => {
      const event = (await request("POST", "", { name: "Checkout test" })).body;
      const own = (await request("POST", `/${event.id}/join`, {}, 1)).body;
      const member = (await request("POST", `/${event.id}/join`, {}, 2)).body;
      const item = (await request("POST", `/${event.id}/beers`, { ...beerBody, cost_price: 10 })).body;
      await request("PUT", `/${event.id}`, { status: "live", checkoutSettings: { commissionMode: "profile", fixedFee: 1, commissionRules: [{ field: "work_relationship", operator: "eq", value: "Student", amount: 1 }, { field: "height", operator: "gt", value: "180", amount: 2 }] } });
      const attempt = { beerId: item.id, qty: 1, volume_ml: 500, expectedPrice: 100, requestId: "checkout-profile-test" };
      assert.equal((await request("POST", `/${event.id}/purchases`, attempt)).status, 422);
      assert.equal((await request("POST", `/${event.id}/quote`, attempt)).status, 422);
      await request("PUT", `/${event.id}/customers/${own.id}`, completeProfile);
      await request("PUT", `/${event.id}/customers/${member.id}`, completeProfile, 2);
      const quote = (await request("POST", `/${event.id}/quote`, attempt)).body;
      assert.equal(quote.commissionFee, 4);
      assert.equal(quote.total, 54);
      assert.equal(quote.commissionRules, undefined);
      assert.equal((await request("GET", `/${event.id}`, undefined, 2)).body.event.checkoutSettings, undefined);
      assert.equal((await request("POST", `/${event.id}/purchases`, { ...attempt, customerId: member.id, quoteId: quote.id })).status, 403);
      assert.equal((await request("POST", `/${event.id}/purchases`, { ...attempt, quoteId: quote.id }, 2)).status, 409);
      await request("PUT", `/${event.id}`, { checkoutSettings: { fixedFee: 2.5 } });
      assert.equal((await request("POST", `/${event.id}/purchases`, { ...attempt, quoteId: quote.id })).status, 409);
      const fresh = (await request("POST", `/${event.id}/quote`, attempt)).body;
      assert.equal(fresh.total, 52.5);
      const receipt = await request("POST", `/${event.id}/purchases`, { ...attempt, quoteId: fresh.id, total_price: 0, commissionFee: 0 });
      assert.equal(receipt.status, 200);
      assert.equal(receipt.body.customer_id, own.id);
      assert.equal(receipt.body.commission_fee, 2.5);
      assert.equal(receipt.body.total_price, fresh.total);
      assert.equal((await request("POST", `/${event.id}/purchases`, { ...attempt, quoteId: fresh.id })).body.id, receipt.body.id);
    });
    await t.test("superoffers have atomic first-come slots and log price changes without purchases", async () => {
      const event = (await request("POST", "", { name: "Offers test" })).body;
      const customers = [];
      for (const uid of [1, 2]) {
        const customer = (await request("POST", `/${event.id}/join`, {}, uid)).body;
        customers.push(customer);
        await request("PUT", `/${event.id}/customers/${customer.id}`, completeProfile, uid);
      }
      const items = [];
      for (let i = 0; i < 6; i++) items.push((await request("POST", `/${event.id}/beers`, { ...beerBody, name: `Offer beer ${i}`, min_price: 10, cost_price: 1 })).body);
      await request("PUT", `/${event.id}`, { status: "live", offerSettings: { enabled: true, intervalMinutes: 1, purchaseSlots: 1, excludedBeerIds: items.slice(1).map((b) => b.id) } });
      assert.equal((await request("POST", `/${event.id}/super-offer`, {}, 2)).status, 403);
      assert.equal((await request("POST", `/${event.id}/super-offer`)).status, 200);
      let saved = await db.collection(EXCHANGES).findOne({ id: event.id });
      assert.equal(saved.superOffer.beerId, items[0].id);
      assert.equal(saved.beers[0].current_price, 10);
      assert.equal(saved.priceUpdates.filter((p) => p.reason === "super-offer-start").length, 6);
      const attempt = { beerId: items[0].id, qty: 1, volume_ml: 500, expectedPrice: 10 };
      const quotes = await Promise.all([1, 2].map(async (uid) => (await request("POST", `/${event.id}/quote`, attempt, uid)).body));
      const receipts = await Promise.all([1, 2].map((uid, i) => request("POST", `/${event.id}/purchases`, { ...attempt, requestId: `offer-last-slot-${uid}`, quoteId: quotes[i].id }, uid)));
      assert.equal(receipts.filter((r) => r.status === 200).length, 1);
      assert.equal(receipts.filter((r) => r.status === 409).length, 1);
      saved = await db.collection(EXCHANGES).findOne({ id: event.id });
      assert.equal(saved.superOffer, null);
      assert.equal(saved.transactions.length, 1);
      assert.ok(saved.beers[0].current_price > 100);
      assert.equal(saved.priceUpdates.filter((p) => p.reason === "super-offer-end-sold").length, 6);
      await request("POST", `/${event.id}/super-offer`);
      saved = await db.collection(EXCHANGES).findOne({ id: event.id });
      await tickOlborsMarkets({ getDatabase: async () => db, now: Date.parse(saved.superOffer.ends_at) + 1 });
      saved = await db.collection(EXCHANGES).findOne({ id: event.id });
      assert.equal(saved.superOffer, null);
      assert.equal(saved.transactions.length, 1);
      assert.equal(saved.priceUpdates.filter((p) => p.reason === "super-offer-end-expired").length, 6);
      await tickOlborsMarkets({ getDatabase: async () => db, now: saved.offerState.nextAt + 1 });
      saved = await db.collection(EXCHANGES).findOne({ id: event.id });
      assert.ok(saved.superOffer);
      await request("PUT", `/${event.id}`, { status: "closed" });
      assert.equal((await db.collection(EXCHANGES).findOne({ id: event.id })).superOffer, null);
    });
    await t.test("only exchange admins can delete an exchange and its stored history and quotes", async () => {
      const event = (await request("POST", "", { name: "Delete test" })).body;
      await db.collection(PRICE_TICKS).insertOne({ event_id: event.id, sample_bucket: 1 });
      await db.collection("olbors_quotes").insertOne({ id: "delete-quote", eventId: event.id });
      assert.equal((await request("DELETE", `/${event.id}`, undefined, 2)).status, 403);
      assert.equal((await request("GET", `/${event.id}`)).status, 200);
      assert.deepEqual((await request("DELETE", `/${event.id}`)).body, { deleted: true });
      assert.equal((await request("GET", `/${event.id}`)).status, 404);
      assert.equal(await db.collection(PRICE_TICKS).countDocuments({ event_id: event.id }), 0);
      assert.equal(await db.collection("olbors_quotes").countDocuments({ eventId: event.id }), 0);
      assert.equal((await request("GET", `/${id}`)).status, 200);
    });
    await t.test("two participants receive committed purchase prices immediately over live streams", async () => {
      const event = (await request("POST", "", { name: "Realtime test" })).body;
      const owner = (await request("POST", `/${event.id}/join`)).body;
      await request("PUT", `/${event.id}/customers/${owner.id}`, completeProfile);
      const item = (await request("POST", `/${event.id}/beers`, { ...beerBody, cost_price: 10 })).body;
      await request("PUT", `/${event.id}`, { status: "live" });
      const controllers = [new AbortController(), new AbortController()];
      const readers = await Promise.all(["test-only", "test-member"].map(async (token, i) => {
        const response = await fetch(`${base}/olbors/${event.id}/stream?token=${token}`, { signal: controllers[i].signal });
        assert.equal(response.status, 200); const reader = response.body.getReader(); await reader.read(); return reader;
      }));
      try {
        const notifications = readers.map(async (reader) => {
          let text = "";
          while (!text.includes("event: change")) text += new TextDecoder().decode((await reader.read()).value);
          return text;
        });
        const started = Date.now();
        assert.equal((await request("POST", `/${event.id}/purchases`, { beerId: item.id, qty: 1, volume_ml: 500, expectedPrice: 100, requestId: "live-purchase-two-users" })).status, 200);
        await Promise.race([Promise.all(notifications), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error("Live notification timeout")), 1500); timer.unref(); })]);
        assert.ok(Date.now() - started < 1500);
        const views = await Promise.all([1, 2].map(async (uid) => (await request("GET", `/${event.id}`, undefined, uid)).body));
        assert.ok(views[0].beers[0].current_price > 100);
        assert.equal(views[0].beers[0].current_price, views[1].beers[0].current_price);
      } finally { controllers.forEach((controller) => controller.abort()); }
    });
  } finally {
    await new Promise((r) => server.close(r));
    await client.close();
    await memory.stop();
  }
});

test("checkout fee rules, percent adjustments, grace period and random draw stability", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  const customer = { ...completeProfile, id: "c", uid: 1 };
  const beer = { id: "b", abv: 5, current_price: 100, min_price: 10, max_price: 200 };
  const d = { id: "e", kioskToken: "secret", starts_at: "2026-10-08T10:00:00Z", customers: [customer], beers: [beer], transactions: [{ event_beer_id: "b", customer_id: "c", qty: 1, volume_ml: 500, created_at: "2026-10-08T10:00:00Z", total_price: 50 }], checkoutSettings: { commissionMode: "profile", fixedFee: 0, commissionRules: [{ field: "work_relationship", operator: "eq", value: "Student", amount: 1 }, { field: "height", operator: "gt", value: "180", amount: 2 }], graceMinutes: 30, minimumPurchases: 1, randomEnabled: true, randomChancePercent: 100, randomRules: [{ id: "sweet", name: "Søtnosrabatt", percent: -10 }] } };
  const quote = checkoutQuote(d, customer, beer, 1, 500, now);
  assert.equal(quote.commissionFee, 3);
  assert.equal(quote.adjustedSubtotal, 45);
  assert.equal(quote.total, 48);
  assert.deepEqual(quote.adjustments, [{ name: "Søtnosrabatt", percent: -10 }]);
  assert.deepEqual(checkoutQuote(d, customer, beer, 1, 500, now + 1000).adjustments, quote.adjustments);
  assert.equal(checkoutQuote({ ...d, transactions: [], checkoutSettings: { ...d.checkoutSettings, graceMinutes: 0, minimumPurchases: 0 } }, customer, beer, 1, 500, now).adjustments.length, 1);
  assert.equal(checkoutQuote(d, customer, beer, 1, 500, Date.parse("2026-10-08T10:10:00Z")).adjustments.length, 0);
  d.checkoutSettings.randomRules[0].percent = 5;
  assert.equal(checkoutQuote(d, customer, beer, 1, 500, now).total, 55.5);
  d.checkoutSettings = { adjustmentsEnabled: true, graceMinutes: 0, minimumPurchases: 1, fixedFee: 2, leaderDiscountPercent: 10, volumeThreshold: 0.5, volumeDiscountPercent: 5, varietyThreshold: 1, varietyDiscountPercent: 5 };
  const ranked = checkoutQuote(d, customer, beer, 1, 500, Date.parse("2026-10-08T10:01:00Z"));
  assert.equal(ranked.adjustmentPercent, -20);
  assert.equal(ranked.total, 42);
  assert.equal(missingProfileFields(customer).length, 0);
  assert.ok(missingProfileFields({ ...customer, height: "0" }).includes("height"));
  assert.throws(() => checkoutSettings({ randomRules: [{ id: "bad", name: "Bad", percent: -100 }] }));
  assert.throws(() => checkoutSettings({ commissionRules: [{ field: "uid", operator: "eq", value: "1", amount: 2 }] }));
});

test("superoffers restore the latest underlying price and enforce excluded beers", () => {
  const d = { status: "live", beers: ["a", "b"].map((id) => ({ id, active: true, current_price: 100, min_price: 10, max_price: 200, volumes: [{ volume_ml: 500 }] })), transactions: [], priceUpdates: [], offerSettings: { enabled: true, mode: "percent", discountPercent: 70, excludedBeerIds: ["a"] }, offerState: { nextAt: 0 } };
  assert.equal(advanceOfferClock(d, 1000, () => 0), true);
  assert.equal(d.superOffer.beerId, "b");
  assert.equal(d.beers[1].current_price, 30);
  const underlying = normalPrices(d); underlying[1].current_price = 110; applyMarketPrices(d, underlying);
  assert.equal(d.beers[1].current_price, 30);
  endSuperOffer(d, 2000);
  assert.equal(d.beers[1].current_price, 110);
  assert.ok(d.priceUpdates.some((point) => point.reason === "super-offer-end-sold" && point.new_price === 110));
  assert.throws(() => offerSettings({ purchaseSlots: 1.5 }));
  d.offerSettings.excludedBeerIds = ["a", "b"];
  assert.equal(startSuperOffer(d, 3000), false);
});

test("historical peak BAC survives closure, sorts purchases and resets after sober gaps", () => {
  const customer = { id: "c", weight: "80", gender: "male" };
  const exchange = { beers: [{ id: "b", abv: 5 }], transactions: [
    { customer_id: "c", event_beer_id: "b", qty: 1, volume_ml: 500, abv: 5, total_price: 50, created_at: "2026-10-08T00:00:00.000Z" },
    { customer_id: "c", event_beer_id: "b", qty: 1, volume_ml: 500, abv: 5, total_price: 50, created_at: "2026-10-08T00:00:00.000Z" },
    { customer_id: "c", event_beer_id: "b", qty: 1, volume_ml: 1000, abv: 10, total_price: 100, created_at: "2026-10-08T10:00:00.000Z" },
  ] };
  const result = customerAnalytics(exchange, customer, Date.parse("2026-11-08T00:00:00Z"));
  assert.equal(result.bac, 0);
  assert.ok(Math.abs(result.peakBac - 78.9 / (80 * 0.68)) < 1e-10);
  assert.equal(result.peakBacAt, "2026-10-08T10:00:00.000Z");
  const recovering = customerAnalytics(exchange, customer, Date.parse("2026-10-08T10:30:00Z"));
  assert.ok(Math.abs(recovering.bac - (result.peakBac - 0.075)) < 1e-10);
  for (const [gender, factor] of [["female", 0.55], ["other", 0.615]]) {
    const byGender = customerAnalytics(exchange, { ...customer, gender }, Date.parse("2026-10-08T10:30:00Z"));
    assert.ok(Math.abs(byGender.peakBac - 78.9 / (80 * factor)) < 1e-10);
    assert.ok(Math.abs(byGender.bac - (byGender.peakBac - 0.075)) < 1e-10);
  }
  assert.equal(customerAnalytics({ ...exchange, transactions: [...exchange.transactions].reverse() }, customer, Date.parse("2027-01-01")).peakBac, result.peakBac);
  assert.equal(customerAnalytics(exchange, { ...customer, weight: "" }).peakBac, null);
  assert.equal(customerAnalytics({ ...exchange, transactions: [] }, customer).peakBac, 0);
});

test("analytics count receipts once, normalize serving volumes and retain historical extremes", () => {
  const exchange = {
    customers: [{ id: "c", name: "Customer", weight: "80", gender: "male" }],
    beers: [{ id: "b", current_price: 40, abv: 5 }],
    transactions: [
      {
        id: "t1",
        event_beer_id: "b",
        customer_id: "c",
        qty: 2,
        volume_ml: 500,
        unit_price: 60,
        created_at: "2026-10-08T12:00:00.000Z",
      },
      {
        id: "t2",
        event_beer_id: "b",
        customer_id: "c",
        qty: 1,
        volume_ml: 250,
        unit_price: 10,
        created_at: "2026-10-08T12:15:00.000Z",
      },
    ],
    priceUpdates: [{ event_beer_id: "b", old_price: 100, new_price: 40 }],
  };
  const stats = beerAnalytics(exchange, exchange.beers[0]);
  assert.equal(stats.revenue, 70);
  assert.equal(stats.quantity, 3);
  assert.equal(stats.liters, 1.25);
  assert.equal(stats.averagePrice, 56);
  assert.equal(stats.highest, 100);
  assert.equal(stats.bestTrade.id, "t2");
  assert.equal(stats.bestTrade.pricePerLiter, 40);
  assert.equal(stats.worstTrade.pricePerLiter, 60);
  assert.equal(stats.topCustomers[0].spend, 70);
  const customer = customerAnalytics(
    exchange,
    exchange.customers[0],
    Date.parse("2026-10-08T13:00:00.000Z"),
  );
  assert.equal(customer.drinks, 3);
  assert.equal(customer.bacDetails.hours, 1);
  assert.equal(customer.bacDetails.totalAlcoholGrams, 49.3125);
  assert.equal(customer.bacDetails.breakdown.length, 2);
  assert.ok(customer.bac > 0);
  assert.equal(
    customerAnalytics(
      exchange,
      { id: "c" },
      Date.parse("2026-10-08T13:00:00.000Z"),
    ).bacDetails.available,
    false,
  );
});

test("closed summary uses full history, distinct fans, serving prices and linked personal data", () => {
  const exchange = {
    beers: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
    customers: [{ id: "one", name: "One" }, { id: "two", name: "Two" }, { id: "old", name: "Old", merged_into: "one" }],
    transactions: Array.from({ length: 105 }, (_, i) => ({ id: String(i), customer_id: "one", event_beer_id: "a", qty: 2, volume_ml: 500, unit_price: 40, total_price: 30, created_at: "2026-10-08T12:00:00.000Z" })),
  };
  exchange.transactions.push(
    { id: "b1", customer_id: "one", event_beer_id: "b", qty: 1, volume_ml: 250, unit_price: 5, created_at: "2026-10-08T12:01:00.000Z" },
    { id: "b2", customer_id: "two", event_beer_id: "b", qty: 1, volume_ml: 500, unit_price: 20, created_at: "2026-10-08T12:02:00.000Z" },
  );
  const result = exchangeSummary(exchange, "two");
  assert.equal(result.transactions, 107);
  assert.equal(result.quantity, 212);
  assert.equal(result.liters, 105.75);
  assert.equal(result.spend, 3175);
  assert.equal(result.beers[0].id, "a");
  assert.equal(result.favorite.id, "b");
  assert.equal(result.favorite.fans, 2);
  assert.equal(result.bestTrade.pricePerLiter, 20);
  assert.equal(result.bestTrade.id, "b1");
  assert.equal(result.explorer.id, "one");
  assert.equal(result.explorer.variety, 2);
  assert.equal(result.participants, 2);
  assert.equal(result.buyers, 2);
  assert.equal(result.personal.transactions, 1);
  assert.equal(result.personal.spend, 20);
  assert.equal(result.personal.bestTrade.pricePerLiter, 40);
  assert.equal(exchangeSummary(exchange).personal, null);
  const empty = exchangeSummary({ ...exchange, transactions: [] }, "one");
  assert.equal(empty.averagePrice, null);
  assert.equal(empty.favorite, null);
  assert.equal(empty.explorer, null);
  assert.equal(empty.bestTrade, null);
  assert.equal(empty.personal.quantity, 0);
});

test("profit triggers count newly earned profit, random checks respect intervals and cooldown", () => {
  const d = { status: "live", beers: [{ id: "a", active: true, base_price: 100, cost_price: 80, current_price: 100, min_price: 10, max_price: 200 }], transactions: [], priceUpdates: [], marketSettings: { profitCrashEnabled: true, profitTriggerMode: "percent", profitTriggerPercent: 15, durationSeconds: 10, cooldownSeconds: 10 } };
  assert.equal(profitEligible(d), false);
  d.transactions.push({ event_beer_id: "a", qty: 1, volume_ml: 500, total_price: 48, cost_price_per_liter: 80 });
  assert.equal(advanceMarketClock(d, 1000, () => 0), true);
  assert.equal(d.marketEvent.source, "profit");
  assert.equal(d.beers[0].current_price, 65);
  applyMarketPrices(d, normalPrices(d).map((b) => ({ ...b, current_price: 112 })));
  assert.equal(d.beers[0].current_price, 72.8);
  endMarketEvent(d, 11000);
  assert.equal(d.beers[0].current_price, 112);
  assert.equal(advanceMarketClock(d, 21001), false);
  d.transactions.push({ event_beer_id: "a", qty: 1, volume_ml: 500, total_price: 50, cost_price_per_liter: 80 });
  assert.equal(advanceMarketClock(d, 22000), true);
  endMarketEvent(d, 32000);
  d.marketSettings = { randomEventsEnabled: true, randomChancePercent: 100, randomEventType: "mixed", durationSeconds: 10, cooldownSeconds: 10 };
  d.marketState.nextRandomAt = 50000;
  assert.equal(advanceMarketClock(d, 49999, () => .9), false);
  assert.equal(advanceMarketClock(d, 50000, () => .9), true);
  assert.equal(d.marketEvent.type, "surge");
  assert.throws(() => marketSettings({ randomChancePercent: NaN }));
  assert.throws(() => startMarketEvent(d, "crash", 51000));
});
test("cross-impact is adjustable and deeper losses produce stronger portfolio increases", () => {
  const beers = ["a", "b", "c"].map((id) => ({ id, active: true, base_price: 100, cost_price: 100, current_price: 100, min_price: 10, max_price: 200 }));
  const neutral = { targetMarginPercent: 0, reversionPercent: 0, marginResponsePercent: 0 };
  const none = recalculate(beers, [], "a", 1, { settings: { ...neutral, crossImpactPercent: 0 } });
  const full = recalculate(beers, [], "a", 1, { settings: { ...neutral, crossImpactPercent: 100 } });
  assert.equal(none[1].current_price, 100);
  assert.equal(full[1].current_price, 98);
  const tx = { event_beer_id: "a", qty: 2, volume_ml: 500, cost_price_per_liter: 100 };
  const mild = recalculate(beers, [{ ...tx, total_price: 90 }], "a", 1);
  const deep = recalculate(beers, [{ ...tx, total_price: 10 }], "a", 1);
  assert.ok(deep.every((beer, index) => beer.current_price > mild[index].current_price));
});

test("buying pressure keeps its direction despite profit regulation and reversion", () => {
  const beers = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, active: true, base_price: 100, cost_price: 80, current_price: id === "a" ? 150 : 30, min_price: 10, max_price: 200 }));
  for (const revenue of [0, 10000]) {
    const txs = [{ event_beer_id: "a", qty: 1, volume_ml: 500, cost_price_per_liter: 80, total_price: revenue }];
    const next = recalculate(beers, txs, "a", 1, { settings: { reversionPercent: 20, marginResponsePercent: 30, houseProtection: false } });
    assert.ok(next[0].current_price > beers[0].current_price, "Purchased beer must rise even with large house profit");
    assert.ok(next.slice(1).every((beer, i) => beer.current_price < beers[i + 1].current_price), "Unpurchased beers must fall even below their reversion target");
  }
  let repeated = beers;
  for (let i = 0; i < 10; i++) repeated = recalculate(repeated, [], "a", 1);
  assert.ok(repeated[0].current_price > beers[0].current_price);
  assert.ok(repeated.slice(1).every((beer, i) => beer.current_price < beers[i + 1].current_price));
  const recovering = recalculate(beers.map((beer) => ({ ...beer, current_price: 100 })), [{ event_beer_id: "a", qty: 1, volume_ml: 500, cost_price_per_liter: 80, total_price: -600 }], "a", 1);
  assert.ok(recovering[0].current_price > 100, "Purchased beer also rises during loss recovery");
});

test("house accounting uses liters and captured costs, including legacy receipt totals", () => {
  const beers = [{ id: "b", base_price: 100, cost_price: 500 }];
  const legacy = { event_beer_id: "b", qty: 2, volume_ml: 500, unit_price: 60 };
  assert.deepEqual(houseMetrics(beers, [legacy]), { revenue: 60, cost: 100, balance: -40, estimatedReceipts: 1 });
  assert.equal(houseMetrics(beers, [{ ...legacy, cost_price_per_liter: 50, cost_is_estimate: false }]).cost, 50);
});
test("pricing respects volume, aggression, per-sale caps and emergency hysteresis", () => {
  const beers = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, active: true, base_price: 100, cost_price: 80, min_price: 20, max_price: 200, current_price: 100 }));
  const small = recalculate(beers, [], "a", 1, { volumeMl: 250 });
  const large = recalculate(beers, [], "a", 1, { volumeMl: 500 });
  assert.equal(large[0].current_price - 100, 2 * (small[0].current_price - 100));
  assert.ok(recalculate(beers, [], "a", 1, { settings: { aggressionPercent: 10 } })[0].current_price > large[0].current_price);
  const capped = recalculate(beers, [], "a", 100, { settings: { maxChangePercent: 3 } });
  assert.equal(capped[0].current_price, 103);
  assert.ok(capped.every((b) => Math.abs(b.current_price - 100) <= 3));
  const settings = pricingSettings({ lossLimit: 100 });
  assert.equal(protectionActive({ balance: -60 }, settings, true), true);
  assert.equal(protectionActive({ balance: -40 }, settings, true), false);
  assert.equal(protectionActive({ balance: -100 }, settings, false), true);
  const protectedRows = emergencyPrices(beers.map((b) => ({ ...b, current_price: 20 })), settings);
  assert.ok(protectedRows.every((b) => b.current_price === 88));
  assert.equal(pricingSettings({ houseProtection: false }).houseProtection, false);
});

test("volume-aware pricing stays bounded and rebalances other beers", () => {
  const rows = ["a", "b", "c"].map((id) => ({
    id,
    active: true,
    base_price: 100,
    min_price: 50,
    max_price: 150,
    current_price: 100,
  }));
  const result = recalculate(rows, [], "a", 2, { settings: { targetMarginPercent: 0, marginResponsePercent: 0 } });
  assert.equal(result[0].current_price, 108);
  assert.equal(result[1].current_price, 96);
  assert.equal(result[2].current_price, 96);
  assert.equal(rows[0].current_price, 100);
  for (let i = 0; i < 100; i++)
    for (const b of recalculate(result, [], "a", 100))
      assert.ok(
        b.current_price >= b.min_price && b.current_price <= b.max_price,
      );
});
