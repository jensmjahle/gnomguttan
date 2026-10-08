import { randomUUID } from "node:crypto";
import { houseMetrics } from "./olbors-pricing.js";

export const DEFAULT_MARKET = Object.freeze({ profitCrashEnabled: false, profitTriggerMode: "amount", profitTriggerAmount: 500, profitTriggerPercent: 15, randomEventsEnabled: false, randomIntervalMinutes: 20, randomChancePercent: 15, randomEventType: "mixed", crashPercent: 35, surgePercent: 25, durationSeconds: 120, cooldownSeconds: 600 });
const ranges = { profitTriggerAmount: [1, 1000000], profitTriggerPercent: [0.1, 1000], randomIntervalMinutes: [1, 1440], randomChancePercent: [0, 100], crashPercent: [1, 90], surgePercent: [1, 200], durationSeconds: [10, 3600], cooldownSeconds: [10, 86400] };
export function marketSettings(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new RangeError("Ugyldige markedshendelser.");
  for (const key of Object.keys(input)) if (!Object.hasOwn(DEFAULT_MARKET, key)) throw new RangeError("Ukjent hendelsesinnstilling.");
  const config = { ...DEFAULT_MARKET, ...input };
  for (const [key, [min, max]] of Object.entries(ranges)) if (typeof config[key] !== "number" || !Number.isFinite(config[key]) || config[key] < min || config[key] > max) throw new RangeError(`Ugyldig ${key}.`);
  if (typeof config.profitCrashEnabled !== "boolean" || typeof config.randomEventsEnabled !== "boolean" || !["amount", "percent"].includes(config.profitTriggerMode) || !["crash", "surge", "mixed"].includes(config.randomEventType)) throw new RangeError("Ugyldig hendelsesvalg.");
  return config;
}
const iso = (now) => new Date(now).toISOString();
export function logPrices(d, before, now, reason) {
  const previous = new Map(before.map((b) => [b.id, b.current_price]));
  for (const beer of d.beers) d.priceUpdates.push({ id: randomUUID(), event_beer_id: beer.id, old_price: previous.get(beer.id) ?? beer.current_price, new_price: beer.current_price, updated_at: iso(now), reason });
}
export function normalPrices(d) { return d.beers.map((beer) => ({ ...beer, current_price: beer.normal_price ?? beer.current_price })); }
export function applyMarketPrices(d, prices) {
  const event = d.marketEvent;
  d.beers = prices.map((beer) => {
    const { normal_price, ...rest } = beer;
    const offer = d.superOffer?.beerId === beer.id ? d.superOffer : null;
    if ((!event && !offer) || !beer.active) return rest;
    const factor = event ? 1 + (event.type === "crash" ? -1 : 1) * event.percent / 100 : 1;
    const price = offer ? offer.price : Math.round(beer.current_price * factor * 100) / 100;
    return { ...rest, normal_price: beer.current_price, current_price: Math.max(beer.min_price, Math.min(beer.max_price, price)) };
  });
}
export function startMarketEvent(d, type, now, source = "admin", overrides = {}) {
  if (d.status !== "live") throw new RangeError("Børsen må være åpen.");
  if (d.marketEvent) throw new RangeError("En markedshendelse er allerede aktiv.");
  if (!["crash", "surge"].includes(type)) throw new RangeError("Ugyldig markedshendelse.");
  if (type === "crash" && d.pricingState?.emergency) throw new RangeError("Avslutt tapsvernet før du starter et crack.");
  const config = marketSettings(d.marketSettings), percent = overrides.percent ?? (type === "crash" ? config.crashPercent : config.surgePercent), duration = overrides.durationSeconds ?? config.durationSeconds;
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 1 || percent > (type === "crash" ? 90 : 200) || typeof duration !== "number" || !Number.isFinite(duration) || duration < 10 || duration > 3600) throw new RangeError("Ugyldig styrke eller varighet.");
  const before = d.beers, metrics = houseMetrics(before, d.transactions);
  d.marketEvent = { id: randomUUID(), type, percent, started_at: iso(now), ends_at: iso(now + duration * 1000), source };
  d.marketState = { ...d.marketState, cooldownUntil: now + (duration + config.cooldownSeconds) * 1000, profitAnchorBalance: metrics.balance, profitAnchorCost: metrics.cost, nextRandomAt: now + (duration + config.cooldownSeconds + config.randomIntervalMinutes * 60) * 1000 };
  applyMarketPrices(d, normalPrices(d));
  logPrices(d, before, now, `market-${type}-start`);
  d.marketEvents ??= []; d.marketEvents.push({ ...d.marketEvent });
}
export function endMarketEvent(d, now, reason = "expired") {
  if (!d.marketEvent) return false;
  const before = d.beers, event = d.marketEvent;
  d.marketEvent = null;
  applyMarketPrices(d, normalPrices(d));
  const history = d.marketEvents?.find((item) => item.id === event.id);
  if (history) Object.assign(history, { finished_at: iso(now), finishReason: reason });
  d.marketState = { ...d.marketState, cooldownUntil: Math.max(d.marketState?.cooldownUntil ?? 0, now + marketSettings(d.marketSettings).cooldownSeconds * 1000) };
  logPrices(d, before, now, `market-end-${reason}`);
  return true;
}
export function profitEligible(d, config = marketSettings(d.marketSettings)) {
  const metrics = houseMetrics(d.beers, d.transactions), gain = metrics.balance - (d.marketState?.profitAnchorBalance ?? 0), cost = metrics.cost - (d.marketState?.profitAnchorCost ?? 0);
  return config.profitCrashEnabled && metrics.balance > 0 && (config.profitTriggerMode === "amount" ? gain >= config.profitTriggerAmount : cost > 0 && gain / cost * 100 >= config.profitTriggerPercent);
}
export function marketClockDue(d, now) {
  if (d.status !== "live") return false;
  if (d.marketEvent) return Date.parse(d.marketEvent.ends_at) <= now;
  if (d.pricingState?.emergency) return false;
  if ((d.marketState?.cooldownUntil ?? 0) > now) return false;
  const config = marketSettings(d.marketSettings);
  return profitEligible(d, config) || (config.randomEventsEnabled && (d.marketState?.nextRandomAt ?? 0) <= now);
}
export function advanceMarketClock(d, now, rng = Math.random) {
  if (d.status !== "live") return false;
  if (d.marketEvent) return Date.parse(d.marketEvent.ends_at) <= now && endMarketEvent(d, now);
  if (d.pricingState?.emergency) return false;
  if ((d.marketState?.cooldownUntil ?? 0) > now) return false;
  const config = marketSettings(d.marketSettings);
  if (profitEligible(d, config)) { startMarketEvent(d, "crash", now, "profit"); return true; }
  if (config.randomEventsEnabled && (d.marketState?.nextRandomAt ?? 0) <= now) {
    d.marketState = { ...d.marketState, nextRandomAt: now + config.randomIntervalMinutes * 60000 };
    if (rng() * 100 < config.randomChancePercent) startMarketEvent(d, config.randomEventType === "mixed" ? (rng() < .5 ? "crash" : "surge") : config.randomEventType, now, "random");
    return true;
  }
  return false;
}
