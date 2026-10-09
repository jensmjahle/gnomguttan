import { createHash } from "node:crypto";
import { customerAnalytics } from "./olbors-analytics.js";

export const PROFILE_RULE_FIELDS = ["work_relationship", "marital_status", "height", "weight", "shoe_size", "gender", "experience_level"];
export const REQUIRED_PROFILE_FIELDS = ["weight", "height", "shoe_size", "gender", "work_relationship", "marital_status"];
export const DEFAULT_CHECKOUT = Object.freeze({
  commissionMode: "fixed", fixedFee: 0, commissionRules: [],
  adjustmentsEnabled: false, graceMinutes: 30, minimumPurchases: 3,
  leaderDiscountPercent: 2, lowBacThreshold: 0.2, lowBacSurchargePercent: 2,
  volumeThreshold: 2, volumeDiscountPercent: 3, lowVolumeThreshold: 0.5, lowVolumeSurchargePercent: 2,
  varietyThreshold: 3, varietyDiscountPercent: 3, lowVarietyThreshold: 1, lowVarietySurchargePercent: 2,
  randomEnabled: false, randomChancePercent: 20, randomIntervalMinutes: 30,
  randomRules: [
    { id: "sweet", name: "Søtnosrabatt", percent: -10 },
    { id: "gnome", name: "Gnomrabatt", percent: -10 },
    { id: "weight", name: "Fedmepåslag", percent: 5 },
    { id: "face", name: "Stygg i tryne", percent: 5 },
  ],
});
const ranges = { fixedFee: [0, 10000], graceMinutes: [0, 1440], minimumPurchases: [0, 1000],
  leaderDiscountPercent: [0, 90], lowBacThreshold: [0, 10], lowBacSurchargePercent: [0, 100],
  volumeThreshold: [0, 1000], volumeDiscountPercent: [0, 90], lowVolumeThreshold: [0, 1000], lowVolumeSurchargePercent: [0, 100],
  varietyThreshold: [1, 1000], varietyDiscountPercent: [0, 90], lowVarietyThreshold: [0, 1000], lowVarietySurchargePercent: [0, 100],
  randomChancePercent: [0, 100], randomIntervalMinutes: [1, 1440] };
export function checkoutSettings(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new RangeError("Ugyldige kjøpsregler.");
  for (const key of Object.keys(input)) if (!Object.hasOwn(DEFAULT_CHECKOUT, key)) throw new RangeError("Ukjent kjøpsregel.");
  const config = structuredClone({ ...DEFAULT_CHECKOUT, ...input });
  if (!["fixed", "profile"].includes(config.commissionMode)) throw new RangeError("Ugyldig kurtasjevalg.");
  for (const key of ["adjustmentsEnabled", "randomEnabled"]) if (typeof config[key] !== "boolean") throw new RangeError("Ugyldig bryter.");
  for (const [key, [min, max]] of Object.entries(ranges)) if (typeof config[key] !== "number" || !Number.isFinite(config[key]) || config[key] < min || config[key] > max) throw new RangeError(`Ugyldig ${key}.`);
  if (!Number.isInteger(config.minimumPurchases) || !Number.isInteger(config.varietyThreshold) || !Number.isInteger(config.lowVarietyThreshold)) throw new RangeError("Antall må være heltall.");
  if (!Array.isArray(config.commissionRules) || config.commissionRules.length > 50 || !Array.isArray(config.randomRules) || config.randomRules.length > 50) throw new RangeError("Maks 50 regler per type.");
  for (const rule of config.commissionRules) {
    if (!PROFILE_RULE_FIELDS.includes(rule.field) || !["eq", "gt", "gte", "lt", "lte"].includes(rule.operator) || typeof rule.value !== "string" || rule.value.length > 100 || typeof rule.amount !== "number" || !Number.isFinite(rule.amount) || rule.amount < 0 || rule.amount > 10000) throw new RangeError("Ugyldig kurtasjeregel.");
    if (rule.operator !== "eq" && !Number.isFinite(Number(rule.value))) throw new RangeError("Tallregel krever tallverdi.");
  }
  const ids = new Set();
  for (const rule of config.randomRules) {
    if (typeof rule.id !== "string" || !rule.id || ids.has(rule.id) || typeof rule.name !== "string" || !rule.name.trim() || rule.name.length > 100 || typeof rule.percent !== "number" || !Number.isFinite(rule.percent) || rule.percent < -90 || rule.percent > 100) throw new RangeError("Ugyldig tilfeldig rabatt eller påslag.");
    ids.add(rule.id);
  }
  return config;
}
export function missingProfileFields(customer, config = DEFAULT_CHECKOUT) {
  const required = new Set([...REQUIRED_PROFILE_FIELDS, ...(config.commissionMode === "profile" ? config.commissionRules.map((r) => r.field) : [])]);
  return [...required].filter((key) => {
    const value = customer?.[key];
    if (value == null || !String(value).trim()) return true;
    if (["weight", "height", "shoe_size"].includes(key)) return !Number.isFinite(Number(value)) || Number(value) <= 0;
    if (key === "gender") return !["male", "female", "other"].includes(value);
    return false;
  });
}
const cents = (n) => Math.round(n * 100) / 100;
export const checkoutHash = (config) => createHash("sha256").update(JSON.stringify(config)).digest("hex");
export function checkoutQuote(d, customer, beer, qty, volume, now = Date.now()) {
  const config = checkoutSettings(d.checkoutSettings);
  let fee = config.fixedFee;
  if (config.commissionMode === "profile") for (const rule of config.commissionRules) {
    const value = String(customer[rule.field] ?? "").toLowerCase().trim();
    const expected = rule.value.toLowerCase().trim();
    const matches = rule.operator === "eq" ? value === expected : value && ({ gt: Number(value) > Number(expected), gte: Number(value) >= Number(expected), lt: Number(value) < Number(expected), lte: Number(value) <= Number(expected) })[rule.operator];
    if (matches) fee += rule.amount;
  }
  const adjustments = [];
  const first = d.transactions.reduce((min, tx) => { const at = Date.parse(tx.created_at); return Number.isFinite(at) ? Math.min(min, at) : min; }, Infinity);
  const start = Number.isFinite(first) ? Math.max(first, Date.parse(d.starts_at) || first) : now;
  const metrics = customerAnalytics(d, customer, now);
  const eligible = now >= start + config.graceMinutes * 60000 && d.transactions.length >= config.minimumPurchases;
  if (eligible && config.adjustmentsEnabled) {
    const add = (name, percent) => { if (percent) adjustments.push({ name, percent }); };
    const ranked = d.customers.filter((c) => !c.merged_into && Number(c.weight) > 0).map((c) => ({ id: c.id, bac: customerAnalytics(d, c, now).bac })).sort((a, b) => b.bac - a.bac || a.id.localeCompare(b.id));
    if (ranked[0]?.id === customer.id && ranked[0].bac > 0) add("Promillelederrabatt", -config.leaderDiscountPercent);
    else if (metrics.bac < config.lowBacThreshold) add("Lav promille-påslag", config.lowBacSurchargePercent);
    if (metrics.liters >= config.volumeThreshold) add("Volumrabatt", -config.volumeDiscountPercent);
    else if (metrics.liters < config.lowVolumeThreshold) add("Lavt volum-påslag", config.lowVolumeSurchargePercent);
    const variety = new Set(d.transactions.filter((tx) => tx.customer_id === customer.id).map((tx) => tx.event_beer_id)).size;
    if (variety >= config.varietyThreshold) add("Smakseventyrerrabatt", -config.varietyDiscountPercent);
    else if (variety <= config.lowVarietyThreshold) add("Lite variasjon-påslag", config.lowVarietySurchargePercent);
  }
  if (eligible && config.randomEnabled && config.randomRules.length) {
    // Stable per participant/time window: reopening the dialog cannot reroll a perk.
    const hash = createHash("sha256").update(`${d.kioskToken}:${customer.id}:${Math.floor(now / (config.randomIntervalMinutes * 60000))}`).digest();
    if (hash.readUInt32BE(0) / 0x100000000 * 100 < config.randomChancePercent) {
      const rule = config.randomRules[hash.readUInt32BE(4) % config.randomRules.length];
      adjustments.push({ name: rule.name, percent: rule.percent });
    }
  }
  const offer = d.superOffer;
  const superOfferApplied = Boolean(offer && offer.beerId === beer.id && !offer.buyerUids.includes(customer.uid));
  let unitPrice = beer.current_price;
  if (offer?.beerId === beer.id && !superOfferApplied) {
    const underlying = beer.normal_price ?? beer.current_price;
    unitPrice = d.marketEvent ? Math.max(beer.min_price, Math.min(beer.max_price, cents(underlying * (1 + (d.marketEvent.type === "crash" ? -1 : 1) * d.marketEvent.percent / 100)))) : underlying;
  }
  const subtotal = cents(unitPrice * qty * volume / 1000);
  const percent = Math.max(-90, Math.min(100, adjustments.reduce((sum, r) => sum + r.percent, 0)));
  const adjustedSubtotal = cents(subtotal * (1 + percent / 100));
  return { unitPrice, subtotal, commissionFee: cents(fee), adjustments, adjustmentPercent: percent, adjustedSubtotal,
    total: cents(adjustedSubtotal + fee), superOfferApplied, superOfferId: superOfferApplied ? offer.id : null };
}
