import { Link } from "react-router-dom";
import { Podium } from "./Podium";
import { CustomerAvatar } from "./CustomerAvatar";

type BeerResult = { id: string; name: string; quantity: number; liters: number; spend: number; fans: number; averagePrice: number | null };
type Trade = { beerId: string; beer: string; customerId: string; customer: string; pricePerLiter: number; timestamp: string };
type Totals = { transactions: number; quantity: number; liters: number; spend: number; averagePrice: number | null; variety: number; beers: BeerResult[]; bestTrade: Trade | null };
export type ClosedSummary = Totals & {
  participants: number;
  buyers: number;
  customers: { id: string; uid?: number; avatarUpdatedAt?: number; name: string; profile_image_url?: string; quantity: number; variety: number }[];
  favorite: BeerResult | null;
  explorer: { id: string; name: string; variety: number } | null;
  firstPurchase: { customerId: string; customer: string; timestamp: string } | null;
  personal: Totals | null;
};
type Customer = { id: string; name: string; profile_image_url?: string; liters: number; spend: number; peakBac?: number | null };
const number = (value: number) => value.toLocaleString("nb-NO", { maximumFractionDigits: 2 });

function Metrics({ totals }: { totals: Totals }) {
  return <dl className="ol-final-metrics">
    <div><dt>Øl kjøpt</dt><dd>{number(totals.quantity)}</dd></div>
    <div><dt>Liter totalt</dt><dd>{number(totals.liters)} L</dd></div>
    <div><dt>Barregning</dt><dd>{number(totals.spend)} kr</dd></div>
    <div><dt>Kjøp</dt><dd>{number(totals.transactions)}</dd></div>
    <div><dt>Ulike øl prøvd</dt><dd>{totals.variety}</dd></div>
    <div><dt>Snitt betalt per liter</dt><dd>{totals.averagePrice === null ? "–" : `${number(totals.averagePrice)} kr/L`}</dd></div>
  </dl>;
}

export function ClosedOverview({ summary, customers, eventId, kiosk, myCustomerId, onHistory }: {
  summary: ClosedSummary; customers: Customer[]; eventId: string; kiosk: boolean; myCustomerId: string | null; onHistory: () => void;
}) {
  const beerLink = (id: string, name: string) => kiosk ? name : <Link to={`/olbors/${eventId}/beer/${id}`}>{name}</Link>;
  const customerLink = (id: string, name: string) => kiosk ? name : <Link to={`/olbors/${eventId}/customer/${id}`}>{name}</Link>;
  const ranking = (field: "liters" | "spend" | "peakBac") => [...customers]
    .sort((a, b) => (b[field] ?? -1) - (a[field] ?? -1) || a.id.localeCompare(b.id))
    .map((customer) => ({ ...customer, score: customer[field] ?? 0, available: customer[field] != null }));
  const rankings = [
    { title: "Mest væske konsumert", unit: "L", entries: ranking("liters") },
    { title: "Høyest barregning", unit: "kr", entries: ranking("spend") },
    { title: "Høyeste toppromille", unit: "‰", entries: ranking("peakBac") },
  ];
  const favorite = summary.personal?.beers[0];
  return <div className="ol-final-overview">
    <section className="ol-final-heading">
      <span className="ol-final-eyebrow">Børsen er stengt · Resultatene er klare</span>
      <h2>For en børs det ble!</h2>
      <p>{summary.transactions ? `${summary.buyers} deltakere kjøpte ${number(summary.quantity)} øl fordelt på ${summary.variety} sorter. Her er kveldens tall og kåringer.` : "Ingen kjøp ble registrert på denne børsen ennå."}</p>
      {!kiosk && <button onClick={onHistory}>Se hele kjøpshistorikken</button>}
    </section>
    <div className="ol-final-podiums">
      {rankings.map((list) => <Podium key={list.title} title={list.title} unit={list.unit} entries={list.entries.filter((entry) => entry.available)} />)}
    </div>
    <div className="ol-final-rankings">
      {rankings.map((list) => <section className="ol-card" key={list.title}>
        <h2>{list.title} · Alle deltakere</h2>
        <ol className="ol-final-ranking-list">{list.entries.map((entry, index) => <li key={entry.id}>
          <span className="ol-ranking-position">{entry.available ? index + 1 : "–"}</span>
          <CustomerAvatar name={entry.name} src={entry.profile_image_url} />
          <span className="ol-ranking-name">{customerLink(entry.id, entry.name)}</span>
          <strong>{entry.available ? `${number(entry.score)} ${list.unit}` : "–"}</strong>
        </li>)}</ol>
        {!list.entries.length && <p>Ingen deltakere.</p>}
      </section>)}
    </div>
    <small>Toppromille er høyeste beregnede verdi under børsen, med forbrenning mellom kjøp. Manglende vekt vises som «–». Et underholdningsestimat, ikke en måling.</small>
    <div className="ol-final-stat-panels">
      <section className="ol-card">
        <h2>Hele børsen i tall</h2>
        <p>{summary.buyers} handlet · {summary.participants} deltakere totalt</p>
        <Metrics totals={summary} />
      </section>
      {!kiosk && <section className="ol-card ol-final-personal">
        <h2>Din børs</h2>
        {summary.personal ? <>
          <Metrics totals={summary.personal} />
          <p><strong>Ditt favorittøl: </strong>{favorite ? <>{beerLink(favorite.id, favorite.name)} · {favorite.quantity} øl</> : "Du registrerte ingen kjøp."}</p>
          {summary.personal.bestTrade && <p><strong>Ditt beste kupp: </strong>{beerLink(summary.personal.bestTrade.beerId, summary.personal.bestTrade.beer)} · {number(summary.personal.bestTrade.pricePerLiter)} kr/L</p>}
          {myCustomerId && <Link to={`/olbors/${eventId}/customer/${myCustomerId}`}>Se din kjøpshistorikk →</Link>}
        </> : <p>Du har ingen deltakerprofil knyttet til denne børsen. En administrator kan knytte en historisk profil til Gnomguttan-brukeren din.</p>}
      </section>}
    </div>
    <section className="ol-final-awards">
      <h2>Kveldens kåringer</h2>
      <p>Basert på registrerte kjøp. Favoritter måles i kjøp, ikke stjerner eller vurderinger.</p>
      <div className="ol-final-award-grid">
        <article className="ol-card"><span aria-hidden="true">🏆</span><h3>Publikumsfavoritten</h3>
          {summary.favorite ? <><strong>{beerLink(summary.favorite.id, summary.favorite.name)}</strong><p>{summary.favorite.fans} ulike kjøpere · {summary.favorite.quantity} øl</p></> : <p>Ingen kjøp ennå.</p>}
        </article>
        <article className="ol-card"><span aria-hidden="true">🍻</span><h3>Den store bestselgeren</h3>
          {summary.beers[0] ? <><strong>{beerLink(summary.beers[0].id, summary.beers[0].name)}</strong><p>{summary.beers[0].quantity} øl · {number(summary.beers[0].liters)} liter</p></> : <p>Ingen kjøp ennå.</p>}
        </article>
        <article className="ol-card"><span aria-hidden="true">🧭</span><h3>Smakseventyreren</h3>
          {summary.explorer ? <><strong>{customerLink(summary.explorer.id, summary.explorer.name)}</strong><p>Prøvde {summary.explorer.variety} forskjellige øl</p></> : <p>Ingen kjøp ennå.</p>}
        </article>
        <article className="ol-card"><span aria-hidden="true">🎯</span><h3>Børsens beste kupp</h3>
          {summary.bestTrade ? <><strong>{customerLink(summary.bestTrade.customerId, summary.bestTrade.customer)}</strong><p>{beerLink(summary.bestTrade.beerId, summary.bestTrade.beer)} · {number(summary.bestTrade.pricePerLiter)} kr/L</p></> : <p>Ingen kjøp ennå.</p>}
        </article>
      </div>
    </section>
    {!kiosk && summary.beers.length > 0 && <section className="ol-card">
      <h2>Slik gikk det med ølene</h2>
      <div className="ol-final-beer-results">{summary.beers.map((beer) => <div className="ol-row" key={beer.id}>
        <span>{beerLink(beer.id, beer.name)}<small>{beer.fans} kjøpere · {number(beer.liters)} L</small></span>
        <strong>{beer.quantity} øl<small>{number(beer.spend)} kr</small></strong>
      </div>)}</div>
    </section>}
  </div>;
}
