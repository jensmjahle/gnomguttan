import { randomUUID } from "node:crypto";
import { normalPrices, applyMarketPrices, logPrices } from "./olbors-market.js";
export const DEFAULT_OFFERS = Object.freeze({ enabled: false, intervalMinutes: 15, mode: "minimum", discountPercent: 70, purchaseSlots: 1, durationSeconds: 300, excludedBeerIds: [] });
export function offerSettings(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new RangeError("Ugyldige supertilbud.");
  for (const key of Object.keys(input)) if (!Object.hasOwn(DEFAULT_OFFERS, key)) throw new RangeError("Ukjent tilbudsregel.");
  const config = { ...DEFAULT_OFFERS, ...input };
  if (typeof config.enabled !== "boolean" || !["minimum", "percent"].includes(config.mode) || !Array.isArray(config.excludedBeerIds) || config.excludedBeerIds.length > 1000 || config.excludedBeerIds.some((id) => typeof id !== "string")) throw new RangeError("Ugyldige tilbudsvalg.");
  for (const [key, min, max] of [["intervalMinutes", 1, 1440], ["discountPercent", 1, 90], ["purchaseSlots", 1, 100], ["durationSeconds", 10, 3600]]) if (typeof config[key] !== "number" || !Number.isFinite(config[key]) || config[key] < min || config[key] > max) throw new RangeError(`Ugyldig ${key}.`);
  if (!Number.isInteger(config.purchaseSlots)) throw new RangeError("Antall tilbudskjøpere må være heltall.");
  return config;
}
export function endSuperOffer(d, now = Date.now(), reason = "sold") {
  if (!d.superOffer) return false;
  const before = d.beers;
  const offer = d.superOffer; d.superOffer = null;
  const archived = d.superOffers?.find((row) => row.id === offer.id);
  if (archived) Object.assign(archived, { finished_at: new Date(now).toISOString(), reason, buyerUids: offer.buyerUids, remainingPurchases: offer.remainingPurchases });
  applyMarketPrices(d, normalPrices(d));
  d.offerState = { nextAt: now + offerSettings(d.offerSettings).intervalMinutes * 60000 };
  logPrices(d, before, now, `super-offer-end-${reason}`);
  return true;
}
export function startSuperOffer(d, now = Date.now(), rng = Math.random) {
  if (d.status !== "live" || d.superOffer || d.pricingState?.emergency) throw new RangeError("Supertilbud krever åpen børs uten aktivt tilbud eller tapsvern.");
  const config = offerSettings(d.offerSettings);
  const candidates = d.beers.filter((b) => b.active && b.current_price > b.min_price && !config.excludedBeerIds.includes(b.id) && b.volumes.some((v) => v.stock == null || v.stock > 0));
  if (!candidates.length) return false;
  const beer = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
  const before = d.beers;
  const price = config.mode === "minimum" ? beer.min_price : Math.max(beer.min_price, Math.round(beer.current_price * (1 - config.discountPercent / 100) * 100) / 100);
  d.superOffer = { id: randomUUID(), beerId: beer.id, price, remainingPurchases: config.purchaseSlots, buyerUids: [], started_at: new Date(now).toISOString(), ends_at: new Date(now + config.durationSeconds * 1000).toISOString() };
  d.superOffers ??= []; d.superOffers.push({ ...d.superOffer });
  applyMarketPrices(d, normalPrices(d)); logPrices(d, before, now, "super-offer-start");
  return true;
}
export function offerClockDue(d, now) {
  if (d.status !== "live") return false;
  if (d.superOffer) return Date.parse(d.superOffer.ends_at) <= now;
  return !d.pricingState?.emergency && offerSettings(d.offerSettings).enabled && (d.offerState?.nextAt ?? now + 1) <= now;
}
export function advanceOfferClock(d, now, rng = Math.random) {
  if (!offerClockDue(d, now)) return false;
  if (d.superOffer) return endSuperOffer(d, now, "expired");
  d.offerState = { nextAt: now + offerSettings(d.offerSettings).intervalMinutes * 60000 };
  startSuperOffer(d, now, rng); return true;
}
