const total = (t) => Number(t.total_price ?? t.unit_price);
const liters = (t) => (Number(t.qty) * Number(t.volume_ml)) / 1000;
export function exchangeSummary(exchange, customerId = null) {
  const aggregate = (transactions) => {
    const byBeer = new Map();
    let quantity = 0, volume = 0, spend = 0, bestTrade = null;
    for (const t of transactions) {
      const amount = total(t), size = liters(t);
      quantity += Number(t.qty); volume += size; spend += amount;
      const beer = byBeer.get(t.event_beer_id) ?? {
        id: t.event_beer_id,
        name: exchange.beers.find((b) => b.id === t.event_beer_id)?.name ?? "Ukjent øl",
        quantity: 0, liters: 0, spend: 0, fans: new Set(),
      };
      beer.quantity += Number(t.qty); beer.liters += size; beer.spend += amount;
      beer.fans.add(t.customer_id); byBeer.set(beer.id, beer);
      if (size > 0 && (!bestTrade || amount / size < bestTrade.pricePerLiter)) {
        bestTrade = { id: t.id, beerId: beer.id, beer: beer.name, customerId: t.customer_id,
          customer: exchange.customers.find((c) => c.id === t.customer_id)?.name ?? "Ukjent deltaker",
          pricePerLiter: amount / size, timestamp: t.created_at };
      }
    }
    const beers = [...byBeer.values()].map(({ fans, ...beer }) => ({ ...beer,
      fans: fans.size, averagePrice: beer.liters > 0 ? beer.spend / beer.liters : null,
    })).sort((a, b) => b.quantity - a.quantity || b.liters - a.liters || a.id.localeCompare(b.id));
    return { transactions: transactions.length, quantity, liters: volume, spend,
      averagePrice: volume > 0 ? spend / volume : null, variety: beers.length, beers, bestTrade };
  };
  const all = aggregate(exchange.transactions);
  const customers = exchange.customers.filter((c) => !c.merged_into).map((c) => {
    const txs = exchange.transactions.filter((t) => t.customer_id === c.id);
    return { id: c.id, name: c.name, profile_image_url: c.profile_image_url,
      quantity: txs.reduce((s, t) => s + Number(t.qty), 0),
      variety: new Set(txs.map((t) => t.event_beer_id)).size };
  });
  const favorite = [...all.beers].sort((a, b) => b.fans - a.fans || b.quantity - a.quantity || a.id.localeCompare(b.id))[0] ?? null;
  const explorer = customers.filter((c) => c.variety > 0).sort((a, b) => b.variety - a.variety || b.quantity - a.quantity || a.id.localeCompare(b.id))[0] ?? null;
  const first = [...exchange.transactions].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  return { ...all, participants: customers.length,
    buyers: customers.filter((c) => c.quantity > 0).length,
    customers, favorite, explorer,
    firstPurchase: first ? { customerId: first.customer_id,
      customer: exchange.customers.find((c) => c.id === first.customer_id)?.name ?? "Ukjent deltaker",
      timestamp: first.created_at } : null,
    personal: customerId ? aggregate(exchange.transactions.filter((t) => t.customer_id === customerId)) : null,
  };
}
export function beerAnalytics(exchange, beer) {
  const txs = exchange.transactions.filter((t) => t.event_beer_id === beer.id);
  const quantity = txs.reduce((s, t) => s + t.qty, 0),
    volume = txs.reduce((s, t) => s + liters(t), 0),
    revenue = txs.reduce((s, t) => s + total(t), 0);
  const trade = (t) => ({
    id: t.id,
    customerId: t.customer_id,
    customer:
      exchange.customers.find((c) => c.id === t.customer_id)?.name ??
      "Ukjent deltaker",
    pricePerLiter: liters(t) > 0 ? total(t) / liters(t) : null,
    total: total(t),
    qty: t.qty,
    volume_ml: t.volume_ml,
    timestamp: t.created_at,
  });
  const trades = txs.map(trade),
    ranked = trades
      .filter((t) => t.pricePerLiter !== null)
      .sort((a, b) => a.pricePerLiter - b.pricePerLiter);
  const prices = [
    beer.current_price,
    ...exchange.priceUpdates
      .filter((p) => p.event_beer_id === beer.id)
      .flatMap((p) =>
        [p.old_price, p.new_price].filter((p) => p != null).map(Number),
      ),
  ];
  const byCustomer = new Map();
  for (const t of txs) {
    const c = byCustomer.get(t.customer_id) ?? {
      id: t.customer_id,
      name:
        exchange.customers.find((c) => c.id === t.customer_id)?.name ??
        "Ukjent deltaker",
      quantity: 0,
      spend: 0,
      liters: 0,
    };
    c.quantity += t.qty;
    c.spend += total(t);
    c.liters += liters(t);
    byCustomer.set(t.customer_id, c);
  }
  return {
    quantity,
    liters: volume,
    revenue,
    lowest: Math.min(...prices),
    highest: Math.max(...prices),
    averagePrice: volume > 0 ? revenue / volume : null,
    bestTrade: ranked[0] ?? null,
    worstTrade: ranked.at(-1) ?? null,
    topCustomers: [...byCustomer.values()].sort(
      (a, b) => b.quantity - a.quantity || b.spend - a.spend,
    ),
    recentTrades: trades
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 20),
  };
}

export function customerAnalytics(exchange, customer, now = Date.now()) {
  const txs = exchange.transactions.filter(
    (t) => t.customer_id === customer.id,
  );
  const drinks = txs.reduce((s, t) => s + t.qty, 0),
    litersTotal = txs.reduce((s, t) => s + liters(t), 0),
    spend = txs.reduce((s, t) => s + total(t), 0);
  const breakdown = txs.map((t) => {
    const beer = exchange.beers.find((b) => b.id === t.event_beer_id);
    const abv = Number(t.abv ?? beer?.abv ?? 4.5);
    return {
      beerId: t.event_beer_id,
      name: beer?.name ?? "Ukjent øl",
      qty: t.qty,
      volume_ml: t.volume_ml,
      abv,
      grams: (t.qty * t.volume_ml * abv * 0.789) / 100,
      timestamp: t.created_at,
    };
  });
  const grams = breakdown.reduce((s, t) => s + t.grams, 0),
    first = txs.length
      ? Math.min(
          ...txs.map((t) => Date.parse(t.created_at)).filter(Number.isFinite),
        )
      : null;
  const hours =
    first == null || !Number.isFinite(first)
      ? 0
      : Math.max(0, (now - first) / 3600000);
  const available = Number(customer.weight) > 0;
  const factor =
    customer.gender === "female"
      ? 0.55
      : customer.gender === "male"
        ? 0.68
        : 0.615;
  let bac = available
    ? Math.max(0, grams / (Number(customer.weight) * factor) - 0.15 * hours)
    : 0;
  let peakBac = available ? 0 : null, peakBacAt = null;
  let runningBac = 0, previousTime = null;
  const chronological = breakdown.filter((row) => Number.isFinite(Date.parse(row.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  for (const row of chronological) {
    if (!available) break;
    const at = Date.parse(row.timestamp);
    runningBac = Math.max(0, runningBac - (previousTime == null ? 0 : (at - previousTime) / 3600000 * 0.15));
    runningBac += row.grams / (Number(customer.weight) * factor);
    if (runningBac > peakBac) { peakBac = runningBac; peakBacAt = row.timestamp; }
    previousTime = at;
  }
  if (available && previousTime != null) bac = Math.max(0, runningBac - Math.max(0, now - previousTime) / 3600000 * 0.15);
  const grouped = new Map();
  for (const row of breakdown) {
    const key = `${row.beerId}:${row.volume_ml}:${row.abv}`,
      entry = grouped.get(key) ?? { ...row, qty: 0, grams: 0 };
    entry.qty += row.qty;
    entry.grams += row.grams;
    grouped.set(key, entry);
  }
  return {
    liters: litersTotal,
    spend,
    drinks,
    bac,
    peakBac,
    peakBacAt,
    bacDetails: {
      available,
      totalAlcoholGrams: grams,
      firstDrinkAt:
        first == null || !Number.isFinite(first)
          ? null
          : new Date(first).toISOString(),
      hours,
      transactionCount: txs.length,
      breakdown: [...grouped.values()],
    },
  };
}
