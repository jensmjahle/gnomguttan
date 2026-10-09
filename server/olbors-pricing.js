export const DEFAULT_PRICING = Object.freeze({
  aggressionPercent: 4,
  maxChangePercent: 8,
  reversionPercent: 1,
  lossLimit: 500,
  recoveryMarkupPercent: 10,
  houseProtection: true,
  crossImpactPercent: 100,
  targetMarginPercent: 5,
  marginResponsePercent: 5,
});
const limits = { aggressionPercent: [0, 30], maxChangePercent: [0.1, 50], reversionPercent: [0, 20], lossLimit: [0, 1000000], recoveryMarkupPercent: [0, 100], crossImpactPercent: [0, 300], targetMarginPercent: [0, 50], marginResponsePercent: [0, 30] };
export function pricingSettings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Ugyldige prisinnstillinger.');
  const settings = { ...DEFAULT_PRICING, ...input };
  for (const key of Object.keys(input)) if (!Object.hasOwn(DEFAULT_PRICING, key)) throw new RangeError('Ukjent prisinnstilling.');
  for (const [key, [min, max]] of Object.entries(limits)) {
    if (typeof settings[key] !== 'number' || !Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) throw new RangeError(`Ugyldig verdi for ${key}.`);
  }
  if (typeof settings.houseProtection !== 'boolean') throw new RangeError('Ugyldig tapsvern.');
  return settings;
}
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const cents = (n) => Math.round(n * 100) / 100;
export const referenceCost = (beer) => Math.max(0, Number(beer.cost_price ?? beer.base_price));

// Old unit_price is the complete receipt, not the price of one serving.
export function houseMetrics(beers, transactions) {
  const lookup = new Map(beers.map((beer) => [beer.id, beer]));
  let revenue = 0, cost = 0, estimatedReceipts = 0;
  for (const tx of transactions) {
    const captured = tx.cost_price_per_liter;
    const estimate = captured == null || tx.cost_is_estimate === true;
    const costPerLiter = captured == null ? Math.max(0, Number(lookup.get(tx.event_beer_id)?.base_price ?? 0)) : captured;
    revenue += Number(tx.total_price ?? tx.unit_price);
    cost += (Number(tx.qty) * Number(tx.volume_ml) / 1000) * costPerLiter;
    if (estimate) estimatedReceipts++;
  }
  return { revenue: cents(revenue), cost: cents(cost), balance: cents(revenue - cost), estimatedReceipts };
}
export function protectionActive(metrics, settings, previous = false) {
  return settings.houseProtection && (metrics.balance < -settings.lossLimit || (settings.lossLimit > 0 && metrics.balance <= -settings.lossLimit) || (previous && metrics.balance < -settings.lossLimit * 0.5));
}
export function quoteNeedsProtection(metrics, settings, revenue, cost) {
  return settings.houseProtection && revenue < cost && cents(metrics.balance + revenue - cost) < -settings.lossLimit;
}
// A quoted sale is never silently repriced. The API commits this floor first
// and requests a new confirmation before any stock or receipt is changed.
export function emergencyPrices(beers, settings) {
  return beers.map((beer) => beer.active ? { ...beer, current_price: clamp(Math.ceil(Math.max(beer.current_price, referenceCost(beer) * (1 + settings.recoveryMarkupPercent / 100)) * 100 - 1e-9) / 100, beer.min_price, beer.max_price) } : beer);
}
export function recalculate(beers, transactions, boughtId, qty, options = {}) {
  const settings = pricingSettings(options.settings),
    metrics = houseMetrics(beers, transactions),
    emergency = protectionActive(metrics, settings, options.emergency);
  const rows = beers.filter((beer) => beer.active).map((beer) => ({ ...beer }));
  const reference = (beer) => Math.max(1, Math.abs(beer.base_price));
  const last = transactions.at(-1);
  const volumeMl = options.volumeMl ?? (last?.event_beer_id === boughtId ? last.volume_ml : 500);
  const bought = rows.find((beer) => beer.id === boughtId);
  if (!bought) return beers;
  const before = bought.current_price;
  const pressure = reference(bought) * settings.aggressionPercent / 100 * (qty * volumeMl / 500);
  const increase = Math.min(pressure, reference(bought) * settings.maxChangePercent / 100, bought.max_price - before);
  bought.current_price += Math.max(0, increase);
  const others = rows.filter((beer) => beer.id !== boughtId);
  // Redistribute only the increase that actually fit below the bought beer's cap.
  const room = others.reduce((sum, beer) => sum + Math.max(0, beer.current_price - beer.min_price), 0);
  for (const beer of others) if (room > 0) beer.current_price -= Math.min(increase * settings.crossImpactPercent / 100, room) * Math.max(0, beer.current_price - beer.min_price) / room;
  const deficit = (metrics.cost * settings.targetMarginPercent / 100 - metrics.balance) / Math.max(metrics.cost, settings.lossLimit, 1);
  const portfolioShift = clamp(deficit * settings.marginResponsePercent / 100, -0.2, 0.2);
  const result = beers.map((original) => {
    const beer = rows.find((row) => row.id === original.id);
    if (!beer) return original;
    const target = Math.max(beer.base_price, referenceCost(beer) * (1 + settings.targetMarginPercent / 100));
    const reversion = (target - original.current_price) * settings.reversionPercent / 100;
    const drift = beer.id === boughtId ? Math.max(0, reversion) : reversion;
    const step = reference(beer) * settings.maxChangePercent / 100;
    const demand = beer.current_price - original.current_price;
    const adjusted = demand + drift + reference(beer) * portfolioShift;
    // House regulation may change the strength, never reverse buying pressure.
    // Preserve at least half the demand move; a disabled/capped demand move stays put.
    const directional = demand > 0 ? Math.max(demand / 2, adjusted)
      : demand < 0 ? Math.min(demand / 2, adjusted) : 0;
    const next = original.current_price + clamp(directional, -step, step);
    return { ...beer, current_price: clamp(cents(next), beer.min_price, beer.max_price) };
  });
  // Explicit loss protection can lift other beers to their recovery floor.
  // Demand still raises the purchased beer during recovery, within its maximum.
  return emergency ? emergencyPrices(result, settings) : result;
}
export function commission(work) {
  return (
    {
      student: 0.08,
      deltidsjobb: 0.16,
      fulltidsjobb: 0.16,
      arbeidsledig: 0.06,
    }[String(work ?? "").toLowerCase()] ?? 0
  );
}
