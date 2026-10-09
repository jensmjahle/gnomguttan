import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CustomerAvatar } from "./CustomerAvatar";
import { defaultBeerIcon } from "./BeerImagePicker";

export type HistoryPoint = {
  new_price: number;
  old_price?: number | null;
  updated_at: string;
};
type Trade = {
  id: string;
  customerId: string;
  customer: string;
  pricePerLiter: number | null;
  total: number;
  qty: number;
  volume_ml: number;
  timestamp: string;
};
export type BeerStats = {
  quantity: number;
  liters: number;
  revenue: number;
  lowest: number;
  highest: number;
  averagePrice: number | null;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  topCustomers: {
    id: string;
    name: string;
    quantity: number;
    liters: number;
    spend: number;
  }[];
  recentTrades: Trade[];
};
export type BacDetails = {
  available: boolean;
  totalAlcoholGrams: number;
  firstDrinkAt: string | null;
  hours: number;
  transactionCount: number;
  breakdown: {
    beerId: string;
    name: string;
    qty: number;
    volume_ml: number;
    abv: number;
    grams: number;
  }[];
};
const money = (n: number) =>
  n.toLocaleString("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const time = (s: string) => new Date(s).toLocaleString("nb-NO");

export function PriceChart({ history }: { history: HistoryPoint[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width:600px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width:600px)"),
      change = () => setMobile(mq.matches);
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);
  const points = useMemo(
    () => {
      const raw = history
        .map((p) => ({
          price: Number(p.new_price),
          timestamp: Date.parse(p.updated_at),
        }))
        .filter(
          (p) => Number.isFinite(p.price) && Number.isFinite(p.timestamp),
        );
      const compact: typeof raw = [];
      for (const point of raw) {
        if (compact.length > 1 && compact[compact.length - 1].price === point.price && compact[compact.length - 2].price === point.price) compact[compact.length - 1] = point;
        else compact.push(point);
      }
      return compact;
    },
    [history],
  );
  if (!points.length) return <p>Ingen prisendringer ennå.</p>;
  const low = points.reduce((value, point) => Math.min(value, point.price), Infinity),
    high = points.reduce((value, point) => Math.max(value, point.price), -Infinity),
    span = Math.max(1, high - low),
    first = points[0].timestamp,
    last = points[points.length - 1].timestamp;
  const width = mobile ? 400 : 720;
  const x = (ts: number) =>
      55 + ((ts - first) / Math.max(1, last - first)) * (width - 95),
    y = (price: number) => 195 - ((price - low) / span) * 155;
  const line = points.flatMap((p, index) => index ? [`${x(p.timestamp)},${y(points[index - 1].price)}`, `${x(p.timestamp)},${y(p.price)}`] : [`${x(p.timestamp)},${y(p.price)}`]).join(" "),
    active = points[Math.min(selected ?? points.length - 1, points.length - 1)];
  return (
    <div className="ol-chart">
      <svg
        viewBox={`0 0 ${width} 240`}
        role="img"
        aria-label={`Prishistorikk fra ${money(points[0].price)} til ${money(points[points.length - 1].price)} kroner`}
      >
        {[0, 1, 2, 3].map((i) => {
          const price = low + (span * i) / 3;
          return (
            <g key={i}>
              <line
                x1="55"
                x2={width - 40}
                y1={y(price)}
                y2={y(price)}
                className="ol-chart-grid"
              />
              <text x="45" y={y(price) + 4} textAnchor="end">
                {price.toFixed(1)}
              </text>
            </g>
          );
        })}
        <polygon
          points={`55,195 ${line} ${x(last)},195`}
          className="ol-chart-area"
        />
        <polyline
          points={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
        />
        {(mobile ? [0, 1] : [0, 1, 2, 3]).map((i) => {
          const ts = first + ((last - first) * i) / (mobile ? 1 : 3);
          return (
            <text
              key={i}
              x={x(ts)}
              y="222"
              textAnchor={
                i === 0 ? "start" : i === (mobile ? 1 : 3) ? "end" : "middle"
              }
            >
              {new Date(ts).toLocaleString("nb-NO", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </text>
          );
        })}
        <line
          x1={x(active.timestamp)}
          x2={x(active.timestamp)}
          y1="25"
          y2="195"
          className="ol-chart-cursor"
        />
        <circle
          cx={x(active.timestamp)}
          cy={y(active.price)}
          r="5"
          fill="var(--accent)"
          stroke="var(--bg-card)"
          strokeWidth="2"
        />
        <rect
          x="55"
          y="20"
          width={width - 95}
          height="180"
          fill="transparent"
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ts =
              first +
              Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) *
                (last - first);
            let index = 0;
            points.forEach((p, i) => {
              if (
                Math.abs(p.timestamp - ts) <
                Math.abs(points[index].timestamp - ts)
              )
                index = i;
            });
            setSelected(index);
          }}
        />
      </svg>
      <div className="ol-chart-tooltip" aria-live="polite">
        <strong>{money(active.price)} kr/l</strong>
        <span>{time(new Date(active.timestamp).toISOString())}</span>
        <div>
          <button
            type="button"
            aria-label="Forrige prispunkt"
            onClick={() =>
              setSelected(Math.max(0, (selected ?? points.length - 1) - 1))
            }
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Neste prispunkt"
            onClick={() =>
              setSelected(
                Math.min(
                  points.length - 1,
                  (selected ?? points.length - 1) + 1,
                ),
              )
            }
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

export function BeerDetails({
  eventId,
  beer,
  history,
  stats,
  onBuy,
  canBuy,
  customers,
}: {
  eventId: string;
  beer: {
    name: string;
    brewery: string;
    description: string;
    style: string;
    abv: number;
    ibu: number;
    current_price: number;
    image_url?: string;
    min_price?: number;
    max_price?: number;
    volumes: { volume_ml: number; stock?: number }[];
  };
  history: HistoryPoint[];
  stats: BeerStats | null;
  onBuy: () => void;
  canBuy: boolean;
  customers: { id: string; name: string; profile_image_url?: string }[];
}) {
  const [range, setRange] = useState("all");
  const since =
    range === "day"
      ? new Date().setHours(0, 0, 0, 0)
      : Date.now() - (range === "1h" ? 1 : 3) * 3600000;
  const recent = history.filter(
    (p) => range === "all" || Date.parse(p.updated_at) >= since,
  );
  const prior = range === "all" ? undefined : history.filter((p) => Date.parse(p.updated_at) < since).slice(-1)[0];
  const filtered = prior && recent.length ? [{ ...prior, updated_at: new Date(since).toISOString() }, ...recent] : recent;
  const change = filtered.length
    ? beer.current_price - filtered[0].new_price
    : 0;
  const changePercent =
    filtered.length && filtered[0].new_price !== 0
      ? (change / Math.abs(filtered[0].new_price)) * 100
      : 0;
  const tradeCard = (title: string, t: Trade | null) => (
    <div className="ol-metric">
      <span>{title}</span>
      <strong>
        {t?.pricePerLiter == null ? "—" : `${money(t.pricePerLiter)} kr/l`}
      </strong>
      {t && (
        <>
          <Link className="ol-trade-person" to={`/olbors/${eventId}/customer/${t.customerId}`}>
            <CustomerAvatar name={t.customer} src={customers.find((c) => c.id === t.customerId)?.profile_image_url} /><span>{t.customer}</span>
          </Link>
          <small>{time(t.timestamp)}</small>
        </>
      )}
    </div>
  );
  return (
    <>
      <div className="ol-beer-details-layout">
        <div className="ol-beer-details-main">
      <section className="ol-card ol-beer-hero">
        <div className="ol-beer-identity"><img src={beer.image_url || defaultBeerIcon} alt={beer.name} onError={(e) => { e.currentTarget.src = defaultBeerIcon; }} /><div><span className="ol-beer-eyebrow">{beer.style || "Øl"}</span><h2>{beer.name}</h2><p>{beer.brewery}</p></div></div>
        <strong className="ol-beer-hero-price">{money(beer.current_price)} <small>kr/l</small></strong>
        <p className={`ol-beer-hero-change ${change >= 0 ? "ol-up" : "ol-down"}`}>{change >= 0 ? "+" : ""}{money(changePercent)} % ({money(change)} kr/l)<small>i valgt periode</small></p>
        <button className="ol-beer-detail-buy" disabled={!canBuy} onClick={onBuy}>Kjøp {beer.name}</button>
        <h3>Om ølet</h3>
        <p>{beer.description}</p>
        <div className="ol-beer-facts">
          <span>{beer.abv}% ABV</span>
          {beer.ibu > 0 && <span>{beer.ibu} IBU</span>}
          <span>{beer.style}</span>
          {beer.min_price != null && <span>Min {money(beer.min_price)} kr/l</span>}
          {beer.max_price != null && <span>Maks {money(beer.max_price)} kr/l</span>}
          {beer.volumes.map((v) => (
            <span key={v.volume_ml}>
              {v.volume_ml} ml{v.stock == null ? "" : ` · ${v.stock} på lager`}
            </span>
          ))}
        </div>
      </section>
      {stats && (
        <>
          <section className="ol-card ol-beer-trade-stats">
            <h2>Kjøp og nøkkeltall</h2>
            <div className="ol-metrics">
              {tradeCard("Beste kjøp", stats.bestTrade)}
              {tradeCard("Verste kjøp", stats.worstTrade)}
              <div className="ol-metric">
                <span>Solgte serveringer</span>
                <strong>{stats.quantity} stk</strong>
                <small>
                  {money(stats.liters)} liter · {money(stats.revenue)} kr omsatt
                </small>
              </div>
              <div className="ol-metric">
                <span>Gjennomsnittlig betalt pris</span>
                <strong>
                  {stats.averagePrice == null ? "—" : money(stats.averagePrice)}{" "}
                  kr/l
                </strong>
                <small>Inkludert kurtasje, vektet etter volum</small>
              </div>
            </div>
          </section>
          <section className="ol-card">
            <h2>Toppkunder for {beer.name}</h2>
            {stats.topCustomers.map((c, i) => (
              <Link
                className="ol-customer-link"
                key={c.id}
                to={`/olbors/${eventId}/customer/${c.id}`}
              >
                <span>
                  <span className="ol-trade-person"><CustomerAvatar name={c.name} src={customers.find((customer) => customer.id === c.id)?.profile_image_url} /><span>{i + 1}. {c.name}</span></span>
                </span>
                <span>
                  {c.quantity} serveringer · {money(c.spend)} kr
                </span>
              </Link>
            ))}
            {!stats.topCustomers.length && <p>Ingen kjøp ennå.</p>}
          </section>
        </>
      )}
        </div>
      <section className="ol-card ol-detail">
        <h2>Kursutvikling</h2>
        <div className="ol-actions">
          {[
            ["1h", "Siste time"],
            ["3h", "Siste 3 timer"],
            ["day", "I dag"],
            ["all", "Hele børsen"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <PriceChart key={range} history={filtered} />
        <div className="ol-metrics">
          <div className="ol-metric">
            <span>Endring i perioden</span>
            <strong className={change >= 0 ? "ol-up" : "ol-down"}>
              {money(changePercent)}%
            </strong>
            <small>{money(change)} kr/l</small>
          </div>
          <div className="ol-metric">
            <span>Høyeste kurs</span>
            <strong>{stats ? money(stats.highest) : "—"} kr/l</strong>
          </div>
          <div className="ol-metric">
            <span>Laveste kurs</span>
            <strong>{stats ? money(stats.lowest) : "—"} kr/l</strong>
          </div>
          <div className="ol-metric">
            <span>Nåværende pris</span>
            <strong>{money(beer.current_price)} kr/l</strong>
          </div>
        </div>
      </section>
      </div>
    </>
  );
}

export function CustomerDetails({
  customer: c,
  canEdit,
  onEdit,
  closed = false,
}: {
  customer: {
    name: string;
    liters: number;
    spend: number;
    bac: number;
    peakBac?: number | null;
    peakBacAt?: string | null;
    drinks?: number;
    bacDetails?: BacDetails;
    profile_image_url?: string;
    phone?: string;
    shoe_size?: string;
    weight?: string;
    gender?: string;
    work_relationship?: string;
    sexual_orientation?: string;
    ethnicity?: string;
    experience_level?: string;
  };
  canEdit: boolean;
  onEdit: () => void;
  closed?: boolean;
}) {
  const [details, setDetails] = useState(false);
  const b = c.bacDetails;
  return (
    <>
      <section className="ol-card">
        <div className="ol-customer-heading">
          <div className="ol-customer-avatar">
            {c.name.slice(0, 1).toUpperCase()}
            {c.profile_image_url && (
              <img
                src={c.profile_image_url}
                alt=""
                onError={(e) => {
                  e.currentTarget.hidden = true;
                }}
              />
            )}
          </div>
          <div>
            <h2>{c.name}</h2>
            <p>{c.work_relationship ?? "Gnomguttan-deltaker"}</p>
          </div>
          {canEdit && <button onClick={onEdit}>Rediger profil</button>}
        </div>
        <div className="ol-metrics">
          <div className="ol-metric">
            <span>Kjøpte serveringer</span>
            <strong>{c.drinks ?? 0}</strong>
          </div>
          <div className="ol-metric">
            <span>Totalt brukt</span>
            <strong>{money(c.spend)} kr</strong>
          </div>
          <div className="ol-metric">
            <span>Totalt volum</span>
            <strong>{money(c.liters)} L</strong>
          </div>
        </div>
        {canEdit && (
          <dl className="ol-profile-facts">
            {[
              ["Telefon", c.phone],
              ["Skostørrelse", c.shoe_size],
              ["Vekt", c.weight ? `${c.weight} kg` : null],
              ["Arbeidsforhold", c.work_relationship],
              ["Kjønn", c.gender],
              ["Legning", c.sexual_orientation],
              ["Etnisitet", c.ethnicity],
              ["Erfaring", c.experience_level],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "Ikke oppgitt"}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      <section className="ol-card">
        <h2>{closed ? "Høyeste toppromille" : "Estimert promille"}</h2>
        <strong className="ol-bac-number">
          {b?.available ? `${money(closed ? c.peakBac ?? 0 : c.bac)} ‰` : "—"}
        </strong>
        <p>
          {b?.available
            ? "Beregnet fra registrert vekt, ølenes alkoholprosent og kjøpt volum."
            : "Legg inn vekt i profilen for å vise estimatet."}
        </p>
        <small>Et grovt underholdningsestimat, ikke en måling.</small>
        {closed && c.peakBacAt && <p>Høyeste verdi oppnådd {time(c.peakBacAt)}.</p>}
        <div className="ol-metrics">
          <div className="ol-metric">
            <span>Registrerte serveringer</span>
            <strong>{c.drinks ?? 0}</strong>
          </div>
          <div className="ol-metric">
            <span>Alkohol totalt</span>
            <strong>{money(b?.totalAlcoholGrams ?? 0)} g</strong>
          </div>
          <div className="ol-metric">
            <span>Første registrerte kjøp</span>
            <strong className="ol-metric-date">
              {b?.firstDrinkAt ? time(b.firstDrinkAt) : "Ingen kjøp"}
            </strong>
          </div>
        </div>
        <button aria-expanded={details} onClick={() => setDetails((v) => !v)}>
          {details ? "Skjul beregningsdetaljer" : "Vis beregningsdetaljer"}
        </button>
        {details && (
          <div>
            <p>
              {b?.transactionCount ?? 0} kjøp{closed ? " · Historisk topp med forbrenning mellom kjøp" : ` · ${money(b?.hours ?? 0)} timer siden første kjøp`}
            </p>
            {b?.breakdown.map((row, i) => (
              <div className="ol-row" key={i}>
                <span>
                  {row.qty} × {row.name} · {row.volume_ml} ml · {row.abv}%
                </span>
                <strong>{money(row.grams)} g alkohol</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

