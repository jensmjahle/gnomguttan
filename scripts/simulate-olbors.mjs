import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { recalculate, pricingSettings, houseMetrics, referenceCost, quoteNeedsProtection, emergencyPrices, protectionActive } from "../server/olbors-pricing.js";
import { advanceMarketClock, startMarketEvent, endMarketEvent, normalPrices, applyMarketPrices } from "../server/olbors-market.js";

const cents = (n) => Math.round(n * 100) / 100;
function random(seed) { let state = seed >>> 0; return () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296); }
function legacy(beers, transactions, boughtId, qty) {
  const rows = beers.map((b) => ({ ...b })), target = rows.reduce((s, b) => s + b.base_price, 0);
  let income = 0, fair = 0;
  for (const t of transactions) { const b = beers.find((b) => b.id === t.event_beer_id); income += t.qty * t.unit_price; fair += t.qty * b.base_price; }
  const factor = fair ? Math.max(.8, Math.min(1.2, 1 + ((income - fair) / fair) * .1)) : 1;
  const bought = rows.find((b) => b.id === boughtId); bought.current_price = Math.min(bought.max_price, bought.current_price + Math.max(1, qty));
  for (let i = 0; i < 10; i++) {
    const excess = rows.reduce((s, b) => s + b.current_price, 0) - target;
    if (Math.abs(excess) < 1e-6) break;
    const others = rows.filter((b) => b.id !== boughtId), slack = (b) => excess > 0 ? Math.max(0, b.current_price - b.min_price) : Math.max(0, b.max_price - b.current_price), room = others.reduce((s, b) => s + slack(b), 0);
    if (room < 1e-9) break;
    for (const b of others) b.current_price = Math.max(b.min_price, Math.min(b.max_price, b.current_price - excess * slack(b) / room));
  }
  return rows.map((b) => ({ ...b, current_price: Math.max(b.min_price, Math.min(b.max_price, Number((b.current_price * (1 + (1 - factor) * .25)).toFixed(1)))) }));
}
const scenarios = ["balanced", "favorite", "bargain", "mixed-volume", "bulk", "expensive-stock", "impossible-cap", "historic-debt", "scheduled-shocks", "profit-crashes", "random-shocks"];
const presets = { gentle: { aggressionPercent: 1.5, maxChangePercent: 4, reversionPercent: .5 }, standard: {}, aggressive: { aggressionPercent: 10, maxChangePercent: 20, reversionPercent: .5 } };
function simulate(seed, scenario, preset, old = false) {
  const rng = random(seed), settings = pricingSettings({ ...preset, lossLimit: 150 });
  let beers = Array.from({ length: 6 }, (_, i) => ({ id: `beer-${i}`, active: true, base_price: 100 + i * 8, cost_price: 80 + i * 6, min_price: 15, max_price: 220, current_price: 100 + i * 8 }));
  if (["expensive-stock", "impossible-cap", "historic-debt"].includes(scenario)) beers = beers.map((b) => ({ ...b, cost_price: 130, current_price: 30, ...(scenario === "impossible-cap" ? { max_price: 60 } : {}) }));
  const buyers = Array.from({ length: 10 }, (_, i) => ({ id: `customer-${i}`, favorite: Math.floor(rng() * 6), commission: [0, .08, .16, .06][i % 4] }));
  const txs = scenario === "historic-debt" ? [{ id: "historic", event_beer_id: "beer-0", customer_id: buyers[0].id, qty: 5, volume_ml: 1000, unit_price: 0, cost_price_per_liter: 130 }] : [];
  const initial = houseMetrics(beers, txs).balance;
  const book = { status: "live", beers, transactions: txs, priceUpdates: [], marketSettings: scenario === "profit-crashes" ? { profitCrashEnabled: true, profitTriggerAmount: 200, durationSeconds: 60, cooldownSeconds: 60 } : scenario === "random-shocks" ? { randomEventsEnabled: true, randomChancePercent: 35, randomIntervalMinutes: 1, durationSeconds: 30, cooldownSeconds: 30 } : { durationSeconds: 60, cooldownSeconds: 60 } };
  let emergency = false, requotes = 0, blocked = 0, minBalance = initial, maxJump = 0, accepted = 0, emergencyTrades = 0;
  for (let turn = 0; turn < 200; turn++) {
    const now = Date.UTC(2026, 9, 8) + turn * 5000;
    if (!old) {
      const previous = beers;
      advanceMarketClock(book, now, rng);
      if (scenario === "scheduled-shocks" && turn % 40 === 5 && !book.marketEvent) startMarketEvent(book, turn % 80 === 5 ? "crash" : "surge", now, "simulation");
      beers = book.beers;
      maxJump = Math.max(maxJump, ...beers.map((b, i) => Math.abs(b.current_price - previous[i].current_price)));
    }
    const buyer = buyers[turn % 10], elasticity = scenario === "bargain" ? 7 : scenario === "favorite" ? .2 : 1.4;
    const favorite = scenario === "favorite" ? 0 : buyer.favorite;
    const scores = beers.map((b, i) => ({ id: b.id, score: (i === favorite ? 1.8 : 0) - elasticity * b.current_price / 100 + rng() * .6 }));
    const id = scores.sort((a, b) => b.score - a.score)[0].id;
    const qty = scenario === "bulk" && rng() < .3 ? 10 : rng() < .1 ? 2 : 1;
    const volume = scenario === "mixed-volume" ? [200, 330, 500, 1000][Math.floor(rng() * 4)] : 500;
    let beer = beers.find((b) => b.id === id), subtotal = beer.current_price * qty * volume / 1000;
    let revenue = cents(subtotal + (buyer.commission ? Math.max(.25, subtotal * buyer.commission) : 0));
    const cost = referenceCost(beer) * qty * volume / 1000, before = houseMetrics(beers, txs);
    if (!old && quoteNeedsProtection(before, settings, revenue, cost)) {
      const protectedPrices = emergencyPrices(normalPrices(book), settings);
      if (book.marketEvent || protectedPrices.some((b, i) => b.current_price !== beers[i].current_price)) {
        maxJump = Math.max(maxJump, ...protectedPrices.map((b, i) => Math.abs(b.current_price - beers[i].current_price)));
        endMarketEvent(book, now, "house-protection");
        beers = protectedPrices.map(({ normal_price, ...beer }) => beer); book.beers = beers; emergency = true; requotes++;
        beer = beers.find((b) => b.id === id); subtotal = beer.current_price * qty * volume / 1000;
        revenue = cents(subtotal + (buyer.commission ? Math.max(.25, subtotal * buyer.commission) : 0));
      }
      if (quoteNeedsProtection(before, settings, revenue, cost)) { blocked++; continue; }
    }
    if (!old) assert.ok(before.balance < -settings.lossLimit ? revenue >= cost - .01 : cents(before.balance + revenue - cost) >= -settings.lossLimit - .01, "Loss guard breached");
    txs.push({ id: `tx-${turn}`, customer_id: buyer.id, event_beer_id: id, qty, volume_ml: volume, unit_price: revenue, total_price: revenue, cost_price_per_liter: referenceCost(beer), cost_is_estimate: false });
    const eventWasActive = Boolean(book.marketEvent);
    if (!old && protectionActive(houseMetrics(beers, txs), settings, emergency)) endMarketEvent(book, now, "house-protection");
    const normalBefore = normalPrices(book);
    const normalNext = old ? legacy(beers, txs, id, qty) : recalculate(normalBefore, txs, id, qty, { settings, volumeMl: volume, emergency });
    if (!old && !protectionActive(houseMetrics(beers, txs), settings, emergency)) {
      for (const [i, row] of normalNext.entries()) {
        assert.ok(row.id === id ? row.current_price >= normalBefore[i].current_price : row.current_price <= normalBefore[i].current_price, "House regulation reversed buying pressure");
      }
    }
    if (!old) applyMarketPrices(book, normalNext);
    const next = old ? normalNext : book.beers;
    const recovering = !old && protectionActive(houseMetrics(beers, txs), settings, emergency);
    for (const [i, row] of next.entries()) {
      assert.ok(Number.isFinite(row.current_price) && row.current_price >= row.min_price && row.current_price <= row.max_price);
      if (!old && !recovering && !eventWasActive) assert.ok(Math.abs(row.current_price - beers[i].current_price) <= Math.max(1, Math.abs(row.base_price)) * settings.maxChangePercent / 100 + .011, "Normal step cap breached");
      maxJump = Math.max(maxJump, Math.abs(row.current_price - beers[i].current_price));
    }
    beers = next; const metrics = houseMetrics(beers, txs);
    emergency = !old && protectionActive(metrics, settings, emergency);
    book.pricingState = { emergency };
    if (emergency) emergencyTrades++;
    minBalance = Math.min(minBalance, metrics.balance); accepted++;
  }
  return { initial, ...houseMetrics(beers, txs), minBalance, requotes, blocked, accepted, emergencyTrades, marketEvents: book.marketEvents?.length ?? 0, maxJump: cents(maxJump), finalPrices: beers.map((b) => b.current_price) };
}
const seeds = Number(process.argv[2] ?? 200);
assert.ok(Number.isInteger(seeds) && seeds >= 1 && seeds <= 1000);
const results = [], baseline = [];
for (const scenario of scenarios) {
  for (const [name, preset] of Object.entries(presets)) {
    const runs = Array.from({ length: seeds }, (_, i) => simulate(i + 1, scenario, preset));
    results.push({ scenario, preset: name, runs: seeds, meanBalance: cents(runs.reduce((s, r) => s + r.balance, 0) / seeds), worstBalance: Math.min(...runs.map((r) => r.balance)), worstDrawdown: Math.min(...runs.map((r) => r.minBalance)), accepted: runs.reduce((s, r) => s + r.accepted, 0), requotes: runs.reduce((s, r) => s + r.requotes, 0), blocked: runs.reduce((s, r) => s + r.blocked, 0), marketEvents: runs.reduce((s, r) => s + r.marketEvents, 0), largestNormalOrRecoveryJump: Math.max(...runs.map((r) => r.maxJump)) });
  }
  if (!["scheduled-shocks", "profit-crashes", "random-shocks"].includes(scenario)) {
    const runs = Array.from({ length: seeds }, (_, i) => simulate(i + 1, scenario, {}, true));
    baseline.push({ scenario, runs: seeds, meanBalance: cents(runs.reduce((s, r) => s + r.balance, 0) / seeds), worstDrawdown: Math.min(...runs.map((r) => r.minBalance)) });
  }
}
const report = { setup: { beers: 6, participants: 10, requestedPurchases: 200, seeds, scenarios, presets, newRuns: results.length * seeds, legacyRuns: baseline.length * seeds, lossLimit: 150, note: "Synthetic behavior, not a profit guarantee. Historic-debt starts at -650 kr; impossible-cap intentionally blocks purchases. Legacy replay uses the old algorithm and identical seeds." }, results, baseline };
await mkdir("reports", { recursive: true });
await writeFile("reports/olbors-pricing-simulation.json", JSON.stringify(report, null, 2));
const table = results.map((r) => `| ${r.scenario} | ${r.preset} | ${r.meanBalance} | ${r.worstDrawdown} | ${r.requotes} | ${r.blocked} |`).join("\n");
await writeFile("reports/olbors-pricing-simulation.md", `# Ølbørs simulation\n\n${report.setup.newRuns} new-algorithm runs and ${report.setup.legacyRuns} legacy runs, each with 6 beers, 10 participants and 200 purchase attempts. Reproducible seeds 1–${seeds}.\n\nAll prices stayed finite and within bounds. No accepted purchase increased loss beyond the 150 kr budget; inherited debt may already exceed it. Behavioral models are synthetic.\n\n| Scenario | Preset | Mean final balance (kr) | Worst drawdown (kr) | Requotes | Blocked |\n| --- | --- | ---: | ---: | ---: | ---: |\n${table}\n\nHistoric debt starts at -650 kr. Impossible-cap has a max price below cost; blocking is the expected safe outcome.\n`);
console.log(JSON.stringify({ ...report.setup, invariantChecks: "passed", report: "reports/olbors-pricing-simulation.json", standard: results.filter((r) => r.preset === "standard"), baseline }, null, 2));
