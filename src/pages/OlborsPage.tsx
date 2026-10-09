import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { appApi } from "@/services/appApi";
import { vocechatService } from "@/services/vocechat";
import { CustomerAvatar } from "@/components/olbors/CustomerAvatar";
import { CheckoutControls, SuperOfferControls, type CheckoutSettings, type OfferSettings, type SuperOffer, type PurchaseQuote } from "@/components/olbors/CheckoutControls";
import { BeerImagePicker, defaultBeerIcon } from "@/components/olbors/BeerImagePicker";
import { HouseSummary, PricingControls, type PricingSettings, type House } from "@/components/olbors/PricingControls";
import { MarketEventBanner, MarketEventControls, type MarketEvent, type MarketSettings } from "@/components/olbors/MarketEvents";
import { useAuthStore } from "@/store/authStore";
import "./OlborsPage.css";
import {
  BeerDetails,
  CustomerDetails,
  type BeerStats,
  type BacDetails,
  type HistoryPoint,
} from "@/components/olbors/ExchangeDetails";
import { Podium } from "@/components/olbors/Podium";
import { ClosedOverview, type ClosedSummary } from "@/components/olbors/ClosedOverview";
import {
  LiveIndicator,
  PriceRange,
} from "@/components/olbors/MarketIndicators";

type Exchange = {
  id: string;
  name: string;
  status: string;
  currency: string;
  adminUids: number[];
  image_url?: string;
  version?: number;
  pricingSettings?: PricingSettings;
  house?: House;
  marketEvent?: MarketEvent | null;
  marketSettings?: MarketSettings;
  historySampleAt?: string | null;
  maxUnitsPerPurchase?: number;
  checkoutSettings?: CheckoutSettings;
  checkoutRevision?: string;
  offerSettings?: OfferSettings;
  superOffer?: SuperOffer | null;
};
type Volume = { volume_ml: number; stock?: number };
type Beer = {
  id: string;
  name: string;
  brewery: string;
  style: string;
  description: string;
  image_url: string;
  abv: number;
  ibu: number;
  position: number;
  active: boolean;
  base_price: number;
  cost_price?: number;
  min_price: number;
  max_price: number;
  current_price: number;
  normal_price?: number;
  volumes: Volume[];
  last_hours_change?: number;
};
type Customer = {
  drinks?: number;
  bacDetails?: BacDetails;
  id: string;
  uid?: number;
  avatarUpdatedAt?: number;
  name: string;
  liters: number;
  spend: number;
  bac: number;
  peakBac?: number | null;
  weight?: string;
  height?: string;
  marital_status?: string;
  missingProfileFields?: string[];
  gender?: string;
  work_relationship?: string;
  commissionRate?: number;
  phone?: string;
  shoe_size?: string;
  sexual_orientation?: string;
  ethnicity?: string;
  experience_level?: string;
  profile_image_url?: string;
};
type Tx = {
  id: string;
  beer_name: string;
  customer_name: string;
  qty: number;
  volume_ml: number;
  unit_price: number;
  total_price?: number;
  customer_id: string;
  event_beer_id: string;
  created_at: string;
};
type Snapshot = {
  event: Exchange;
  beers: Beer[];
  customers: Customer[];
  transactions: Tx[];
  isAdmin: boolean;
  myCustomerId: string | null;
  summary?: ClosedSummary | null;
};
type Person = { uid: number; name: string };
const money = (n: number) =>
  Number(n).toLocaleString("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const blankBeer = {
  name: "",
  brewery: "",
  style: "",
  description: "",
  image_url: "",
  abv: 4.5,
  ibu: 0,
  base_price: 100,
  min_price: 50,
  max_price: 150,
  current_price: 100,
  position: 0,
  active: true,
  volumes: [{ volume_ml: 500 }],
};
const workLabel = (value?: string) =>
  ["Student", "Deltidsjobb", "Fulltidsjobb", "Arbeidsledig"].find(
    (v) => v.toLowerCase() === value?.toLowerCase(),
  ) ?? "";
const hourlyPercent = (b: Beer) => {
  const change = b.last_hours_change ?? 0,
    previous = b.current_price - change;
  return previous === 0 ? 0 : (change / Math.abs(previous)) * 100;
};
const message = (e: unknown) => {
  if (!(e instanceof Error)) return "Noe gikk galt.";
  try {
    return JSON.parse(e.message).error ?? e.message;
  } catch {
    return e.message;
  }
};

export function OlborsPage({ kiosk = false }: { kiosk?: boolean }) {
  const { eventId, beerId, customerId } = useParams();
  // Exchange state belongs to one route. Remount when leaving or switching
  // exchanges so dialogs, tabs and delayed responses cannot leak into the next view.
  return <OlborsView key={`${kiosk ? "kiosk" : "app"}:${eventId ?? "list"}:${beerId ?? ""}:${customerId ?? ""}`} kiosk={kiosk} />;
}

function OlborsView({ kiosk = false }: { kiosk?: boolean }) {
  const { eventId, beerId, customerId } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const requestedTab = search.get("view");
  const tab = requestedTab && ["market", "customers", "history", "admin"].includes(requestedTab) ? requestedTab : "market";
  const setTab = useCallback((next: string) => {
    navigate(`/olbors/${eventId}${next === "market" ? "" : `?view=${next}`}`);
  }, [eventId, navigate]);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const [exchangeMenuOpen, setExchangeMenuOpen] = useState(false);
  const [pricingSaved, setPricingSaved] = useState(false);
  const [addMember, setAddMember] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExchangeMenuOpen(false);
        setBuy(null);
        setEditing(null);
        setProfile(null);
        setAddMember(false);
        setProfileWarning(null);
        if (search.get("edit") === "profile") navigate(`/olbors/${eventId}/customer/${customerId}`, { replace: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [search, navigate, eventId, customerId]);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<Exchange[]>([]),
    [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);
  const [buy, setBuy] = useState<Beer | null>(null),
    [volume, setVolume] = useState(500),
    [qty, setQty] = useState(1);
  const [editing, setEditing] = useState<Partial<Beer> | null>(null),
    [history, setHistory] = useState<HistoryPoint[]>([]);
  const [profile, setProfile] = useState<Customer | null>(null);
  const [receiptPage, setReceiptPage] = useState<{
    total: number;
    items: Tx[];
  }>({ total: 0, items: [] });
  const [offset, setOffset] = useState(0);
  const [retryId, setRetryId] = useState("");
  const [quote, setQuote] = useState<PurchaseQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);
  const [profileWarning, setProfileWarning] = useState<Customer | null>(null);
  const [kioskPage, setKioskPage] = useState(0);
  const kioskPageCount = Math.max(
    1,
    Math.ceil((data?.beers.filter((b) => b.active).length ?? 0) / 6),
  );
  useEffect(() => {
    if (!kiosk) return;
    const timer = setInterval(
      () => setKioskPage((p) => (p + 1) % kioskPageCount),
      15000,
    );
    return () => clearInterval(timer);
  }, [kiosk, kioskPageCount]);
  const [beerStats, setBeerStats] = useState<BeerStats | null>(null);
  const latestTransactionId = data?.transactions[0]?.id;
  const exchangeVersion = data?.event.version;
  const historySampleAt = data?.event.historySampleAt;
  const maxUnitsPerPurchase = data?.event.maxUnitsPerPurchase ?? 1;
  useEffect(() => { setQty((current) => Math.min(current, maxUnitsPerPurchase)); }, [maxUnitsPerPurchase]);
  useEffect(() => {
    if (data && !data.isAdmin && tab === "admin") setTab("market");
  }, [data, tab, setTab]);
  useEffect(() => {
    setBuy((prev) => {
      if (!prev) return prev;
      const current = data?.beers.find((b) => b.id === prev.id);
      return current?.current_price !== prev.current_price && current
        ? current
        : prev;
    });
  }, [data?.beers]);
  const key = search.get("key") ?? "";
  const load = useCallback(async () => {
    if (eventId) {
      const d = kiosk
        ? await appApi.get<Snapshot>(
            `/olbors/kiosk/${eventId}?key=${encodeURIComponent(key)}`,
            { skipAuth: true },
          )
        : await appApi.get<Snapshot>(`/olbors/${eventId}`);
      const accountAvatar = <T extends { uid?: number; avatarUpdatedAt?: number; profile_image_url?: string }>(customer: T): T => ({ ...customer,
        profile_image_url: customer.uid != null ? vocechatService.avatarUrl(customer.uid, customer.avatarUpdatedAt) : customer.profile_image_url,
      });
      d.customers = d.customers.map(accountAvatar);
      if (d.summary) d.summary.customers = d.summary.customers.map(accountAvatar);
      setData(d);
    } else setEvents(await appApi.get<Exchange[]>("/olbors"));
  }, [eventId, kiosk, key]);
  useEffect(() => {
    if (!eventId || (!kiosk && !token)) return;
    const query = kiosk
      ? `key=${encodeURIComponent(key)}`
      : `token=${encodeURIComponent(token ?? "")}`;
    const source = new EventSource(
      `/app-api/olbors/stream/${eventId}?${query}`,
    );
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load().catch(() => {}), 100);
    };
    // Re-read on connect/reconnect to catch changes made before the stream opened.
    source.addEventListener("ready", refresh);
    source.addEventListener("change", refresh);
    return () => {
      source.close();
      clearTimeout(timer);
    };
  }, [eventId, kiosk, key, token, load]);
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        await load();
        if (!stopped) {
          setError("");
          setConnected(true);
        }
      } catch (e) {
        if (!stopped) {
          setError(message(e));
          setConnected(false);
        }
      } finally {
        if (!stopped) {
          setLoading(false);
          timer = setTimeout(tick, 4000);
        }
      }
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [load]);
  useEffect(() => {
    if (data?.isAdmin)
      void appApi
        .get<Person[]>("/users")
        .then(setPeople)
        .catch((e) => setError(message(e)));
  }, [data?.isAdmin]);
  useEffect(() => {
    if (eventId && beerId)
      void Promise.all([
        appApi.get<typeof history>(
          `/olbors/${eventId}/beers/${beerId}/history`,
        ),
        appApi.get<typeof beerStats>(
          `/olbors/${eventId}/beers/${beerId}/stats`,
        ),
      ])
        .then(([h, stats]) => {
          setHistory(h);
          setBeerStats(stats);
        })
        .catch((e) => setError(message(e)));
  }, [eventId, beerId, latestTransactionId, exchangeVersion, historySampleAt]);
  useEffect(() => {
    if (eventId && !kiosk && (tab === "history" || beerId || customerId))
      void appApi
        .get<typeof receiptPage>(
          `/olbors/${eventId}/transactions?offset=${offset}&limit=100${beerId ? `&beerId=${beerId}` : ""}${customerId ? `&customerId=${customerId}` : ""}`,
        )
        .then(setReceiptPage)
        .catch((e) => setError(message(e)));
  }, [
    eventId,
    kiosk,
    tab,
    beerId,
    customerId,
    offset,
    latestTransactionId,
    exchangeVersion,
  ]);
  useEffect(() => {
    setOffset(0);
  }, [eventId, beerId, customerId, tab]);
  useEffect(() => {
    if (search.get("edit") !== "profile") return;
    const own = data?.customers.find((c) => c.uid === user?.uid && c.id === customerId);
    if (own) setProfile((current) => current ?? own);
  }, [search, data?.customers, customerId, user?.uid]);
  useEffect(() => {
    let cancelled = false;
    setQuote(null);
    if (!buy || !Number.isInteger(qty) || qty < 1 || qty > maxUnitsPerPurchase) { setQuoteLoading(false); return; }
    setQuoteLoading(true);
    void appApi.post<PurchaseQuote>(`/olbors/${eventId}/quote`, { beerId: buy.id, qty, volume_ml: volume })
      .then((next) => { if (!cancelled) setQuote(next); })
      .catch((e) => { if (!cancelled) setError(message(e)); })
      .finally(() => { if (!cancelled) setQuoteLoading(false); });
    return () => { cancelled = true; };
  }, [eventId, buy, qty, volume, maxUnitsPerPurchase, data?.event.checkoutRevision, quoteNonce]);
  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(() => setQuoteNonce((n) => n + 1), Math.max(1, Date.parse(quote.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [quote]);
  async function upload(file: File, purpose: "beer" | "exchange" = "beer"): Promise<string> {
    if (purpose !== "exchange" && file.size > 5 * 1024 * 1024)
      throw new Error("Maksimal bildestørrelse er 5 MB.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Kunne ikke lese bildet."));
      r.readAsDataURL(file);
    });
    return (
      await appApi.post<{ url: string }>(`/olbors/${eventId}/images`, {
        dataUrl,
        purpose,
      })
    ).url;
  }
  async function action(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setError(message(e));
      // A protected quote can commit new prices while rejecting the sale.
      // Refresh before allowing another confirmation, even without the live stream.
      await load().catch(() => {});
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action(async () => {
      const d = await appApi.post<Exchange>("/olbors", { name: f.get("name") });
      window.location.assign(`/olbors/${d.id}`);
    });
  }
  async function saveBeer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      body: Record<string, unknown> = {};
    for (const k of ["name", "brewery", "style", "description", "image_url"])
      body[k] = f.get(k);
    for (const k of [
      "abv",
      "ibu",
      "position",
      "base_price",
      "min_price",
      "max_price",
      "current_price",
    ])
      body[k] = Number(f.get(k));
    body.cost_price = String(f.get("cost_price") ?? "").trim() ? Number(f.get("cost_price")) : null;
    body.active = f.get("active") === "on";
    body.volumes = String(f.get("volumes"))
      .split(",")
      .map((s) => {
        const [ml, stock] = s.trim().split(":");
        return {
          volume_ml: Number(ml),
          ...(stock?.trim() ? { stock: Number(stock) } : {}),
        };
      });
    await action(async () => {
      const file = f.get("image");
      if (file instanceof File && file.size)
        body.image_url = await upload(file);
      if (editing?.id)
        await appApi.put(`/olbors/${eventId}/beers/${editing.id}`, body);
      else await appApi.post(`/olbors/${eventId}/beers`, body);
      setEditing(null);
    });
  }
  const selectedCustomer = data?.customers.find((c) => c.id === data.myCustomerId);
  const startPurchase = async (beer: Beer) => {
    let own = selectedCustomer;
    if (!own) {
      try { own = await appApi.post<Customer>(`/olbors/${eventId}/join`); await load(); }
      catch (e) { setError(message(e)); return; }
    }
    if (!own.missingProfileFields || own.missingProfileFields.length) { setProfileWarning(own); return; }
    setError(""); setBuy(beer); setRetryId(crypto.randomUUID()); setVolume(beer.volumes[0]?.volume_ml ?? 500); setQty(1);
  };
  const detailBeer = data?.beers.find((b) => b.id === beerId),
    detailCustomer = data?.customers.find((c) => c.id === customerId);
  const txs =
    kiosk || (tab === "market" && !beerId && !customerId)
      ? (data?.transactions ?? [])
      : receiptPage.items;
  const rankings = (
    field: "liters" | "spend" | "bac" | "peakBac",
    label: string,
    unit: string,
  ) => kiosk ? (
    <Podium
      title={label}
      unit={unit}
      entries={[...(data?.customers ?? [])]
        .filter((c) => c[field] != null)
        .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0))
        .slice(0, 3)
        .map((customer) => ({ ...customer, score: customer[field] ?? 0 }))}
    />
  ) : (
    <section className="ol-card">
      <h2>{label}</h2>
      <ol>
        {[...(data?.customers ?? [])]
          .sort((a, b) => (b[field] ?? -1) - (a[field] ?? -1))
          .map((c) => (
            <li key={c.id}>
              {kiosk ? (
                c.name
              ) : (
                <Link to={`/olbors/${eventId}/customer/${c.id}`}>{c.name}</Link>
              )}
              <strong>
                {c[field] == null ? "–" : `${money(c[field])} ${unit}`}
              </strong>
            </li>
          ))}
      </ol>
    </section>
  );
  const closedOverview = data?.event.status === "closed" && !beerId && !customerId && (tab === "market" || kiosk);
  const openKiosk = () => void action(async () => {
    const link = await appApi.get<{ path: string }>(`/olbors/${eventId}/kiosk-link`);
    window.open(link.path, "_blank", "noopener,noreferrer");
  });
  const selectTab = (next: string) => {
    setTab(next);
    setExchangeMenuOpen(false);
  };
  const exchangeMenu = data && eventId ? {
    title: data.event.name,
    items: [
      { label: data.event.status === "closed" ? "Oppsummering" : "Marked", active: tab === "market" && !beerId && !customerId, onClick: () => selectTab("market") },
      { label: "Deltakere", active: tab === "customers" && !beerId && !customerId, onClick: () => selectTab("customers") },
      { label: "Kjøpshistorikk", active: tab === "history" && !beerId && !customerId, onClick: () => selectTab("history") },
      ...(data.isAdmin ? [{ label: "Administrasjon", active: tab === "admin" && !beerId && !customerId, onClick: () => selectTab("admin") }, { label: "Åpne kiosk", onClick: openKiosk }] : []),
      ...(!data.myCustomerId && data.event.status !== "closed" ? [{ label: "Bli med på børsen", disabled: busy, onClick: () => void action(() => appApi.post(`/olbors/${eventId}/join`)) }] : []),
    ],
  } : undefined;
  const content = (
    <div
      className={`olbors ${kiosk ? "ol-kiosk" : ""} ${kiosk && closedOverview ? "ol-kiosk-closed" : ""}`}
    >
      <header className="ol-header">
        {data?.event.image_url && (
          <img
            className="ol-event-image"
            src={data.event.image_url}
            alt=""
            onError={(e) => {
              e.currentTarget.hidden = true;
            }}
          />
        )}
        <div>
          <h1>{data?.event.name ?? "Ølbørs"}</h1>
          {data && (
            <div className="ol-market-status">
              <LiveIndicator status={data.event.status} connected={connected} />
              <span>
                {new Date().toLocaleDateString("nb-NO", {
                  day: "numeric",
                  month: "long",
                })}
              </span>
            </div>
          )}
          {kiosk && kioskPageCount > 1 && (
            <small>
              Ølside {(kioskPage % kioskPageCount) + 1} av {kioskPageCount} ·
              bytter automatisk
            </small>
          )}
          <p>
            {data
              ? (
                  {
                    draft: "Klargjøres",
                    live: "Børsen er åpen",
                    closed: "Børsen er avsluttet",
                  } as Record<string, string>
                )[data.event.status]
              : "Øl, kurser og gode børsøyeblikk."}
          </p>
        </div>
        {!kiosk && exchangeMenu && <button
          className="ol-local-menu-trigger"
          aria-label="Børsmeny"
          aria-expanded={exchangeMenuOpen}
          aria-controls="ol-local-menu"
          onClick={() => setExchangeMenuOpen((open) => !open)}
        ><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={exchangeMenuOpen ? "M6 6l12 12M6 18L18 6" : "M4 6h16M4 12h16M4 18h16"}/></svg>Meny</button>}
        {!kiosk && (
          data && (
            <div className="ol-actions">

              {!data.myCustomerId && data.event.status !== "closed" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(() => appApi.post(`/olbors/${eventId}/join`))
                  }
                >
                  Bli med på børsen
                </button>
              )}
              {data.isAdmin && (
                <button
                  onClick={openKiosk}
                >
                  Åpne kiosk
                </button>
              )}
            </div>
          )
        )}
      {data?.event.marketEvent && <div className="ol-event-banner-slot"><MarketEventBanner key={data.event.marketEvent.id} event={data.event.marketEvent} /></div>}
      {data?.event.superOffer && <div className="ol-event-banner-slot ol-super-offer-banner" role="status"><strong>⚡ Supertilbud · {data.beers.find((b) => b.id === data.event.superOffer?.beerId)?.name}</strong><span>{money(data.event.superOffer.price)} kr/l · {data.event.superOffer.remainingPurchases} tilbudskjøpere igjen · Førstemann til mølla</span></div>}
      </header>
      {!kiosk && exchangeMenu && exchangeMenuOpen && <nav id="ol-local-menu" className="ol-local-menu" aria-label="Navigasjon i børsen">
        {exchangeMenu.items.map((item) => <button key={item.label}
          disabled={"disabled" in item ? item.disabled : false}
          aria-pressed={"active" in item ? item.active : undefined}
          onClick={() => { setExchangeMenuOpen(false); item.onClick(); }}
        >{item.label}</button>)}
      </nav>}
      {error && (
        <p role="alert" className="ol-error">
          {error}
        </p>
      )}
      {loading && <p>Henter børsen …</p>}
      {!eventId && !loading && (
        <>
          <form onSubmit={create} className="ol-card ol-actions">
            <label>
              Navn på ny børs
              <input
                name="name"
                required
                maxLength={150}
                placeholder="Gnomguttans ølbørs"
              />
            </label>
            <button disabled={busy}>Opprett børs</button>
          </form>
          <div className="ol-grid">
            {events.map((e) => (
              <Link className="ol-card" key={e.id} to={`/olbors/${e.id}`}>
                <h2>{e.name}</h2>
                <p>
                  {e.status === "live"
                    ? "Åpen"
                    : e.status === "closed"
                      ? "Avsluttet"
                      : "Klargjøres"}
                </p>
                {e.adminUids.includes(user?.uid ?? 0) && (
                  <small>Administrator</small>
                )}
              </Link>
            ))}
          </div>
          {!events.length && (
            <p>Ingen børser ennå. Opprett den første ovenfor.</p>
          )}
        </>
      )}
      {data && (
        <>
          {!kiosk && (
            <nav className="ol-tabs" aria-label="Ølbørs">
              <button
                aria-label={data.event.status === "closed" ? "Oppsummering" : "Marked"}
                aria-pressed={tab === "market" && !beerId && !customerId}
                onClick={() => selectTab("market")}
              >
                {data.event.status === "closed" ? <>
                  <span className="ol-full-label">Oppsummering</span>
                  <span className="ol-short-label">Resultat</span>
                </> : "Marked"}
              </button>
              <button
                aria-pressed={tab === "customers" && !beerId && !customerId}
                onClick={() => selectTab("customers")}
              >
                Deltakere
              </button>
              <button
                aria-label="Kjøpshistorikk"
                aria-pressed={tab === "history" && !beerId && !customerId}
                onClick={() => selectTab("history")}
              >
                <span className="ol-full-label">Kjøpshistorikk</span>
                <span className="ol-short-label">Historikk</span>
              </button>
              {data.isAdmin && (
                <button
                  aria-label="Administrasjon"
                  aria-pressed={tab === "admin" && !beerId && !customerId}
                  onClick={() => selectTab("admin")}
                >
                  <span className="ol-full-label">Administrasjon</span>
                  <span className="ol-short-label">Admin</span>
                </button>
              )}
            </nav>
          )}
          {!kiosk && (beerId || customerId) && (
            <Link className="ol-detail-back" to={`/olbors/${eventId}${customerId ? "?view=customers" : ""}`}>← {customerId ? "Tilbake til deltakerne" : "Tilbake til børsen"}</Link>
          )}
          {detailBeer && eventId && (
            <BeerDetails
              eventId={eventId}
              beer={detailBeer}
              history={history}
              stats={beerStats}
              onBuy={() => void startPurchase(detailBeer)}
              canBuy={data.event.status === "live" && detailBeer.active && !busy}
              customers={data.customers}
            />
          )}
          {detailCustomer && (
            <CustomerDetails
              customer={detailCustomer}
              canEdit={detailCustomer.uid === user?.uid}
              onEdit={() => setProfile(detailCustomer)}
              closed={data.event.status === "closed"}
            />
          )}{" "}
          {closedOverview && data.summary && eventId && (
            <ClosedOverview
              summary={data.summary}
              customers={data.customers}
              eventId={eventId}
              kiosk={kiosk}
              onHistory={() => setTab("history")}
              myCustomerId={data.myCustomerId}
            />
          )}
          {!closedOverview && (tab === "market" || kiosk) &&
            !beerId &&
            !customerId &&
            data.beers.length > 0 && (
              <div className="ol-grid ol-market-movers">
                {[
                  ["Vinnere siste timen", true],
                  ["Tapere siste timen", false],
                ].map(([title, winners]) => (
                  <section className="ol-card" key={String(title)}>
                    <h2>{title}</h2>
                    {[...data.beers]
                      .filter((b) => b.active)
                      .sort((a, b) =>
                        winners
                          ? hourlyPercent(b) - hourlyPercent(a)
                          : hourlyPercent(a) - hourlyPercent(b),
                      )
                      .slice(0, 3)
                      .map((b) => (
                        <div className="ol-row" key={b.id}>
                          <Link to={`/olbors/${eventId}/beer/${b.id}`}>
                            {b.name}
                            <small className="ol-mover-price">
                              {money(b.current_price)} kr/l
                            </small>
                          </Link>
                          <strong>{money(hourlyPercent(b))}%</strong>
                        </div>
                      ))}
                    <small>Endring siste 60 minutter</small>
                  </section>
                ))}
              </div>
            )}
          {!closedOverview && (tab === "market" || kiosk) && !customerId && !beerId && (
            <div className="ol-grid ol-market-grid">
              {!kiosk && (
                <div className="ol-market-heading">
                  <div>
                    <h2>Øl på børsen</h2>
                    <span>
                      {data.beers.filter((b) => b.active).length} øl · priser
                      per liter
                    </span>
                  </div>
                  <LiveIndicator
                    status={data.event.status}
                    connected={connected}
                  />
                </div>
              )}
              {data.beers
                .filter(
                  (b) =>
                    (kiosk ? b.active : true) && (!beerId || b.id === beerId),
                )
                .sort((a, b) => a.position - b.position)
                .slice(
                  kiosk ? (kioskPage % kioskPageCount) * 6 : 0,
                  kiosk ? (kioskPage % kioskPageCount) * 6 + 6 : undefined,
                )
                .map((b) => (
                  <article
                    className={`ol-card ol-beer ${!b.active ? "ol-inactive" : ""}`}
                    key={b.id}
                  >
                    <div className="ol-beer-heading">
                      <img className="ol-mobile-beer-image" src={b.image_url || defaultBeerIcon} alt="" />
                      <Link to={`/olbors/${eventId}/beer/${b.id}`}>
                        <h2>{b.name}</h2>
                      </Link>
                      <p>
                        {b.abv}% · {b.style}
                      </p>
                    </div>
                    <strong className="ol-price">
                      {money(b.current_price)} <small>kr/l</small>
                    </strong>
                    <PriceRange
                      name={b.name}
                      price={b.current_price}
                      min={b.min_price}
                      max={b.max_price}
                      base={b.base_price}
                    />
                    <p
                      className={`ol-change ${(b.last_hours_change ?? 0) > 0 ? "ol-up" : (b.last_hours_change ?? 0) < 0 ? "ol-down" : "ol-flat"}`}
                    >
                      {(b.last_hours_change ?? 0) > 0
                        ? "↗"
                        : (b.last_hours_change ?? 0) < 0
                          ? "↘"
                          : "—"}{" "}
                      {money(b.last_hours_change ?? 0)} siste time
                    </p>
                    <p className="ol-volumes">
                      {b.volumes
                        .map(
                          (v) =>
                            `${v.volume_ml} ml${v.stock == null ? "" : ` (${v.stock} igjen)`}`,
                        )
                        .join(" · ")}
                    </p>
                    {!kiosk && (
                      <div className="ol-actions">
                        <button
                          className="ol-buy-button"
                          disabled={
                            busy ||
                            !b.active ||
                            data.event.status !== "live"
                          }
                          onClick={() => void startPurchase(b)}
                        >
                          Kjøp
                        </button>
                      </div>
                    )}
                  </article>
                ))}
            </div>
          )}
          {!closedOverview && (tab === "customers" || tab === "market" || kiosk) &&
            !beerId &&
            !customerId && (
              <>
                {(tab === "customers" || kiosk) && (
                  <div className="ol-grid ol-rankings-grid">
                    {rankings("liters", "Mest væske konsumert", "L")}
                    {rankings("spend", "Høyest barregning", "kr")}
                    {rankings(data.event.status === "closed" ? "peakBac" : "bac", data.event.status === "closed" ? "Høyeste toppromille" : "Estimert promille", "‰")}
                  </div>
                )}
                {(tab === "customers" || kiosk) && (
                  <small>
                    Promille er et grovt underholdningsestimat, ikke en måling.
                  </small>
                )}
                {!kiosk && (
                  <section className="ol-card">
                    <div className="ol-section-heading">
                      <h2>Deltakere</h2>
                      <div className="ol-actions">
                        {data.myCustomerId && <button onClick={() => setProfile(data.customers.find((c) => c.id === data.myCustomerId) ?? null)}>Min profil</button>}
                        {data.isAdmin && (
                          <button onClick={() => setAddMember(true)}>
                            Legg til deltaker
                          </button>
                        )}
                      </div>
                    </div>
                    {[...data.customers]
                      .sort((a, b) => b.spend - a.spend)
                      .map((c) => (
                        <div className="ol-row ol-participant-row" key={c.id}>
                          <Link
                            className="ol-customer-link"
                            to={`/olbors/${eventId}/customer/${c.id}`}
                          >
                            <span className="ol-customer-summary">
                              <CustomerAvatar name={c.name} src={c.profile_image_url} />
                              <span>
                                <strong>{c.name}</strong>
                                <small>
                                  {c.drinks ?? 0} serveringer ·{" "}
                                  {money(c.liters)} L ·{" "}
                                  {c.bacDetails?.available
                                    ? data.event.status === "closed" ? `${money(c.peakBac ?? 0)} ‰ toppromille` : `${money(c.bac)} ‰`
                                    : "Promille: –"}
                                </small>
                              </span>
                            </span>
                            <strong>{money(c.spend)} kr</strong>
                          </Link>

                        </div>
                      ))}
                  </section>
                )}
              </>
            )}
          {!closedOverview && (tab === "history" ||
            tab === "market" ||
            kiosk ||
            beerId ||
            customerId) && (
            <section className="ol-card">
              <h2>{customerId ? "Deltakerens kjøpshistorikk" : data.event.status === "closed" && tab === "history" ? "Børsens kjøpshistorikk" : "Siste kjøp"}</h2>
              {tab === "market" && !beerId && !customerId && !kiosk && (
                <button onClick={() => setTab("history")}>
                  Se hele historikken
                </button>
              )}
              <div className="ol-table">
                <table>
                  <thead>
                    <tr>
                      <th>Tid</th>
                      <th>Deltaker</th>
                      <th>Øl</th>
                      <th>Antall</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs
                      .slice(
                        0,
                        kiosk
                          ? 3
                          : tab === "market" && !beerId && !customerId
                            ? 10
                            : undefined,
                      )
                      .map((t) => (
                        <tr key={t.id}>
                          <td>
                            {new Date(t.created_at).toLocaleString("nb-NO")}
                          </td>
                          <td>
                            {kiosk ? (
                              t.customer_name
                            ) : (
                              <Link
                                to={`/olbors/${eventId}/customer/${t.customer_id}`}
                              >
                                {t.customer_name}
                              </Link>
                            )}
                          </td>
                          <td>
                            {kiosk ? (
                              t.beer_name
                            ) : (
                              <Link
                                to={`/olbors/${eventId}/beer/${t.event_beer_id}`}
                              >
                                {t.beer_name}
                              </Link>
                            )}
                          </td>
                          <td>
                            {t.qty} × {t.volume_ml} ml
                          </td>
                          <td>{money(t.total_price ?? t.unit_price)} kr</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!txs.length && <p>Ingen kjøp ennå.</p>}
              {!kiosk && (tab === "history" || beerId || customerId) && (
                <div className="ol-actions">
                  <button
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - 100))}
                  >
                    Forrige
                  </button>
                  <span>
                    {offset + (txs.length ? 1 : 0)}–{offset + txs.length} av{" "}
                    {receiptPage.total}
                  </span>
                  <button
                    disabled={offset + 100 >= receiptPage.total}
                    onClick={() => setOffset(offset + 100)}
                  >
                    Neste
                  </button>
                </div>
              )}
            </section>
          )}
          {tab === "admin" && data.isAdmin && !kiosk && (
            <>
              <nav className="ol-admin-sections" aria-label="Administrasjonsområder">
                {[["events", "Markedshendelser", "Børskrakk, boom og automatikk"], ["offers", "Supertilbud", "Tilbudspris og førstemann til mølla"], ["checkout", "Kurtasje og rabatter", "Personlige kjøpsregler"], ["pricing", "Prisalgoritme", "Kjøpstrykk og tapsvern"], ["beers", "Øl og lager", "Bilder, priser og serveringer"], ["roles", "Brukerroller", "Administratorer og deltakere"]].map(([id, label, description]) => <a key={id} href={`#ol-admin-${id}`}><strong>{label}</strong><small>{description}</small></a>)}
              </nav>
              {data.event.house && <HouseSummary house={data.event.house} />}
              {data.event.offerSettings && <SuperOfferControls key={JSON.stringify(data.event.offerSettings)} settings={data.event.offerSettings} offer={data.event.superOffer ?? null} beers={data.beers} busy={busy}
                onSave={async (offerSettings) => { if (!await action(() => appApi.put(`/olbors/${eventId}`, { offerSettings }))) throw new Error("Kunne ikke lagre supertilbud."); }}
                onStart={async () => { if (!await action(() => appApi.post(`/olbors/${eventId}/super-offer`, {}))) throw new Error("Kunne ikke starte tilbud."); }}
                onStop={async () => { if (!await action(() => appApi.delete(`/olbors/${eventId}/super-offer`))) throw new Error("Kunne ikke stoppe tilbud."); }} />}
              {data.event.checkoutSettings && <CheckoutControls key={JSON.stringify(data.event.checkoutSettings)} settings={data.event.checkoutSettings} busy={busy}
                onSave={async (checkoutSettings) => { if (!await action(() => appApi.put(`/olbors/${eventId}`, { checkoutSettings }))) throw new Error("Kunne ikke lagre kjøpsregler."); }} />}
              <section className="ol-card">
                <h2>Kjøpsregler</h2>
                <form key={maxUnitsPerPurchase} onSubmit={(e) => {
                  e.preventDefault();
                  const limit = Number(new FormData(e.currentTarget).get("maxUnitsPerPurchase"));
                  void action(() => appApi.put(`/olbors/${eventId}`, { maxUnitsPerPurchase: limit }));
                }}>
                  <label>Maks enheter per kjøp
                    <input name="maxUnitsPerPurchase" type="number" min="1" max="100" step="1" required defaultValue={maxUnitsPerPurchase} disabled={busy} />
                  </label>
                  <p>Standard er 1 enhet. Grensen gjelder alle deltakere og serveren avviser kjøp over grensen.</p>
                  <button disabled={busy}>Lagre kjøpsgrense</button>
                </form>
              </section>
              {data.event.pricingSettings && data.event.house && <PricingControls
                key={JSON.stringify(data.event.pricingSettings)}
                settings={data.event.pricingSettings} house={data.event.house} busy={busy}
                onSave={async (pricingSettings) => { setPricingSaved(false); if (!await action(() => appApi.put(`/olbors/${eventId}`, { pricingSettings }))) throw new Error("Kunne ikke lagre prisreglene."); setPricingSaved(true); }}
              />}
              {pricingSaved && <p role="status">Prisreglene er lagret.</p>}
              {data.event.marketSettings && <MarketEventControls
                key={JSON.stringify(data.event.marketSettings)} settings={data.event.marketSettings} event={data.event.marketEvent ?? null} busy={busy}
                onSave={async (marketSettings) => { if (!await action(() => appApi.put(`/olbors/${eventId}`, { marketSettings }))) throw new Error("Kunne ikke lagre hendelsesreglene."); }}
                onStart={async (type, percent, durationSeconds) => { if (!await action(() => appApi.post(`/olbors/${eventId}/market-events`, { type, percent, durationSeconds }))) throw new Error("Kunne ikke starte hendelsen."); }}
                onStop={async () => { if (!await action(() => appApi.delete(`/olbors/${eventId}/market-events/current`))) throw new Error("Kunne ikke avslutte hendelsen."); }}
              />}
              <section className="ol-card">
                <h2>Styr børsen</h2>
                <label>
                  Børsbilde
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void action(async () =>
                          appApi.put(`/olbors/${eventId}`, {
                            image_url: await upload(file, "exchange"),
                          }),
                        );
                    }}
                  />
                </label>
                <div className="ol-actions">
                  <label>
                    Status
                    <select
                      aria-label="Status"
                      value={data.event.status}
                      disabled={busy}
                      onChange={(e) =>
                        void action(() =>
                          appApi.put(`/olbors/${eventId}`, {
                            status: e.target.value,
                          }),
                        )
                      }
                    >
                      <option value="draft">Klargjøres</option>
                      <option value="live">Åpen</option>
                      <option value="closed">Avsluttet</option>
                    </select>
                  </label>
                  <button onClick={() => setEditing(blankBeer)}>
                    Legg til øl
                  </button>
                  <button
                    onClick={() => {
                      const name = window.prompt(
                        "Navn på børsen",
                        data.event.name,
                      );
                      if (name)
                        void action(() =>
                          appApi.put(`/olbors/${eventId}`, { name }),
                        );
                    }}
                  >
                    Endre navn
                  </button>
                </div>
              </section>
              <section id="ol-admin-beers" className="ol-card">
                <h2>Administrer øl</h2>
                {data.beers.map((beer) => (
                  <div className="ol-row" key={beer.id}>
                    <span>
                      {beer.name}{!beer.active && " · Inaktiv"}
                    </span>
                    <button
                      disabled={busy}
                      aria-label={`Rediger ${beer.name}`}
                      onClick={() => setEditing(beer)}
                    >
                      Rediger
                    </button>
                  </div>
                ))}
              </section>
              <section id="ol-admin-roles" className="ol-card">
                <h2>Administratorer og vanlige brukere</h2>
                {people.map((p) => (
                  <div className="ol-row" key={p.uid}>
                    <span>{p.name}</span>
                    <select
                      aria-label={`Rolle for ${p.name}`}
                      disabled={busy}
                      value={
                        data.event.adminUids.includes(p.uid)
                          ? "admin"
                          : "regular"
                      }
                      onChange={(e) =>
                        void action(() =>
                          appApi.put(`/olbors/${eventId}/roles`, {
                            uid: p.uid,
                            role: e.target.value,
                          }),
                        )
                      }
                    >
                      <option value="regular">Vanlig</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                ))}
              </section>
              <section className="ol-card">
                <h2>Koble historiske kunder</h2>
                <p>Koblingen beholder kundens kjøp og statistikk.</p>
                {data.customers.map((c) => (
                  <div className="ol-row" key={c.id}>
                    <span>{c.name}</span>
                    <select
                      aria-label={`Bruker for ${c.name}`}
                      disabled={busy}
                      value={c.uid ?? ""}
                      onChange={(e) => {
                        const uid = e.target.value
                          ? Number(e.target.value)
                          : null;
                        const existing = data.customers.find(
                          (other) =>
                            other.id !== c.id &&
                            other.uid === uid &&
                            uid !== null,
                        );
                        if (
                          existing &&
                          !window.confirm(
                            `Slå sammen ${existing.name} med ${c.name}? Begge kundenes kjøp blir beholdt på ${c.name}.`,
                          )
                        )
                          return;
                        void action(() =>
                          appApi.put(`/olbors/${eventId}/customers/${c.id}`, {
                            uid,
                            merge: Boolean(existing),
                          }),
                        );
                      }}
                    >
                      <option value="">Ikke koblet</option>
                      {people.map((p) => (
                        <option key={p.uid} value={p.uid}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                  </div>
                ))}
              </section>
              <section className="ol-card">
                <h2>Slett ølbørs</h2>
                <p>Sletter børsen, deltakerprofilene på børsen, alle kjøp og hele prishistorikken permanent.</p>
                <button disabled={busy} onClick={async () => {
                  if (!window.confirm(`Slette «${data.event.name}» permanent? Alle kjøp, deltakerprofiler på børsen og prishistorikk slettes. Dette kan ikke angres.`)) return;
                  setBusy(true);
                  setError("");
                  try {
                    await appApi.delete(`/olbors/${eventId}`);
                    navigate("/olbors", { replace: true });
                  } catch (e) {
                    setError(message(e));
                  } finally {
                    setBusy(false);
                  }
                }}>Slett ølbørs</button>
              </section>
            </>
          )}
        </>
      )}
      {buy && (
        <div
          className="ol-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Kjøp øl"
        >
          <form
            className="ol-card"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await appApi.post(`/olbors/${eventId}/purchases`, {
                  requestId: retryId,
                  beerId: buy.id,
                  quoteId: quote?.id,
                  qty,
                  volume_ml: volume,
                  expectedPrice: quote?.expectedPrice,
                });
                setBuy(null);
              }).then((ok) => { if (!ok) setQuoteNonce((n) => n + 1); });
            }}
          >
            <h2>Kjøp {buy.name}</h2>
            <div className="ol-checkout-person"><CustomerAvatar name={selectedCustomer?.name ?? user?.name ?? "Deg"} src={selectedCustomer?.profile_image_url} /><strong>{selectedCustomer?.name ?? user?.name}</strong></div>
            <label>
              Volum
              <select
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
              >
                {buy.volumes.map((v) => (
                  <option key={v.volume_ml} value={v.volume_ml}>
                    {v.volume_ml} ml
                  </option>
                ))}
              </select>
            </label>
            <label>
              Antall
              <input
                type="number"
                min={1}
                max={maxUnitsPerPurchase}
                step={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                required
              />
              <small>Maks {maxUnitsPerPurchase} {maxUnitsPerPurchase === 1 ? "enhet" : "enheter"} per kjøp</small>
            </label>
            {quoteLoading && <p role="status">Beregner totalpris …</p>}
            {quote && <div className="ol-checkout-totals">
              <p><span>Ølpris{quote.superOfferApplied ? " · Supertilbud" : ""}</span><strong>{money(quote.subtotal)} kr</strong></p>
              <p><span>Kurtasje</span><strong>{money(quote.commissionFee)} kr</strong></p>
              {quote.adjustments.map((adjustment, index) => <p key={index} className={adjustment.percent < 0 ? "ol-up" : "ol-down"}><span>{adjustment.name}</span><strong>{adjustment.percent > 0 ? "+" : ""}{money(adjustment.percent)} %</strong></p>)}
              {quote.adjustments.length > 0 && <small>Prosenten gjelder ølprisen. Kurtasje legges til etterpå.</small>}
              <p className="ol-checkout-total"><span>Total</span><strong>{money(quote.total)} kr</strong></p>
            </div>}
            <div className="ol-actions">
              <button disabled={busy || quoteLoading || !quote}>Bekreft kjøp</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setBuy(null)}
              >
                Avbryt
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
          </form>
        </div>
      )}
      {profileWarning && <div className="ol-modal" role="dialog" aria-modal="true" aria-label="Fyll ut profilen">
        <section className="ol-card"><h2>Fyll ut profilen før du kjøper</h2><p>Du må fylle ut vekt, høyde, skostørrelse, kjønn, arbeidsforhold og sivilstatus først. Eventuelle ekstra felt som brukes av børsens kjøpsregler, må også fylles ut.</p>
          <div className="ol-actions"><button onClick={() => { const own = profileWarning; setProfileWarning(null); navigate(`/olbors/${eventId}/customer/${own.id}?edit=profile`); }}>Fyll ut min profil</button><button onClick={() => setProfileWarning(null)}>Avbryt</button></div>
        </section></div>}
      {editing && (
        <div
          className="ol-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Rediger øl"
        >
          <form className="ol-card" onSubmit={saveBeer}>
            <h2>{editing.id ? "Rediger øl" : "Legg til øl"}</h2>
            <div className="ol-grid">
              <label>Innkjøpspris kr/l
                <input name="cost_price" type="number" min="0" max="100000" step="any" defaultValue={editing.cost_price ?? ""} />
                <small>Tomt felt bruker grunnpris som estimert kostnad.</small>
              </label>
              {[
                ["name", "Navn"],
                ["brewery", "Bryggeri"],
                ["style", "Stil"],
                ["description", "Beskrivelse"],
              ].map(([k, label]) => (
                <label key={k}>
                  {label}
                  <input
                    name={k}
                    required={k === "name"}
                    defaultValue={String(editing[k as keyof Beer] ?? "")}
                  />
                </label>
              ))}
              {[
                ["base_price", "Grunnpris kr/l"],
                ["min_price", "Minstepris"],
                ["max_price", "Makspris"],
                ["current_price", "Nåværende pris"],
                ["abv", "Alkohol %"],
                ["ibu", "IBU"],
                ["position", "Rekkefølge"],
              ].map(([k, label]) => (
                <label key={k}>
                  {label}
                  <input
                    name={k}
                    type="number"
                    min={k.includes("price") ? -100000 : 0}
                    step="any"
                    required
                    defaultValue={Number(k === "current_price" ? editing.normal_price ?? editing.current_price ?? 0 : editing[k as keyof Beer] ?? 0)}
                  />
                </label>
              ))}
            </div>
            <BeerImagePicker key={editing.id || "new"} initialImage={editing.image_url} />
            <label>
              Volum og lager (ml:antall, komma mellom volum)
              <input
                name="volumes"
                required
                defaultValue={editing.volumes
                  ?.map(
                    (v) =>
                      `${v.volume_ml}${v.stock == null ? "" : `:${v.stock}`}`,
                  )
                  .join(", ")}
                placeholder="330:24, 500:12"
              />
            </label>
            <label>
              <input
                name="active"
                type="checkbox"
                defaultChecked={editing.active}
              />{" "}
              Aktiv på børsen
            </label>
            <div className="ol-actions">
              <button disabled={busy}>Lagre øl</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Avbryt
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
          </form>
        </div>
      )}
    </div>
  );
  const profileDialog = profile && (
    <div
      className="ol-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Rediger deltaker"
    >
      <form
        className="ol-card"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const body: Record<string, unknown> = {};
          for (const k of [
            "phone",
            "shoe_size",
            "weight",
            "height",
            "marital_status",
            "gender",
            "work_relationship",
            "sexual_orientation",
            "ethnicity",
            "experience_level",
          ])
            body[k] = f.get(k);
          void action(async () => {
            await appApi.put(
              `/olbors/${eventId}/customers/${profile.id}`,
              body,
            );
            setProfile(null);
            if (search.get("edit") === "profile") navigate(`/olbors/${eventId}/customer/${profile.id}`, { replace: true });
          });
        }}
      >
        <h2>{profile.name}</h2>
        <p>Profilbildet hentes fra Gnomguttan-hovedkontoen din.</p>
        <div className="ol-grid">
          {[
            ["phone", "Telefon"],
            ["shoe_size", "Skostørrelse"],
            ["weight", "Vekt i kg"],
            ["height", "Høyde i cm"],
            ["marital_status", "Sivilstatus"],
            ["sexual_orientation", "Legning"],
            ["ethnicity", "Etnisitet"],
            ["experience_level", "Erfaring"],
          ].map(([k, label]) => (
            <label key={k}>
              {label}
              <input
                name={k}
                required={["shoe_size", "weight", "height", "marital_status", ...(profile.missingProfileFields ?? [])].includes(k)}
                type={["shoe_size", "weight", "height"].includes(k) ? "number" : "text"}
                min={["shoe_size", "weight", "height"].includes(k) ? "1" : undefined}
                step="any"
                defaultValue={String(profile[k as keyof Customer] ?? "")}
              />
            </label>
          ))}
        </div>
        <label>
          Kjønn
          <select name="gender" required defaultValue={profile.gender ?? ""}>
            <option value="">Ikke oppgitt</option>
            <option value="male">Mann</option>
            <option value="female">Kvinne</option>
            <option value="other">Annet</option>
          </select>
        </label>
        <label>
          Arbeidsforhold
          <select
            name="work_relationship"
            required
            defaultValue={workLabel(profile.work_relationship)}
          >
            <option value="">Velg arbeidsforhold</option>
            {["Student", "Deltidsjobb", "Fulltidsjobb", "Arbeidsledig", "Pensjonist", "Annet"].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </select>
        </label>
        <div className="ol-actions">
          <button disabled={busy}>Lagre profil</button>
          <button
            type="button"
            disabled={busy}
            onClick={() => { setProfile(null); if (search.get("edit") === "profile") navigate(`/olbors/${eventId}/customer/${profile.id}`, { replace: true }); }}
          >
            Avbryt
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
    </div>
  );
  return kiosk ? (
    content
  ) : (
    <AppLayout>
      {content}
      {profileDialog}
      {addMember && (
        <div
          className="ol-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Legg til deltaker"
        >
          <form
            className="ol-card"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(async () => {
                const c = await appApi.post<Customer>(
                  `/olbors/${eventId}/members`,
                  { uid: Number(f.get("uid")) },
                );
                setAddMember(false);
                if (c.uid === user?.uid) setProfile(c);
              });
            }}
          >
            <h2>Legg til deltaker</h2>
            <p>
              Velg en Gnomguttan-bruker. Brukeren får sin egen børsprofil, med
              samme innlogging.
            </p>
            <label>
              Gnomguttan-bruker
              <select
                name="uid"
                aria-label="Gnomguttan-bruker"
                required
                defaultValue=""
              >
                <option value="">Velg bruker</option>
                {people
                  .filter((p) => !data?.customers.some((c) => c.uid === p.uid))
                  .map((p) => (
                    <option key={p.uid} value={p.uid}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="ol-actions">
              <button disabled={busy}>Legg til bruker</button>
              <button type="button" onClick={() => setAddMember(false)}>
                Avbryt
              </button>
            </div>
          </form>
        </div>
      )}
    </AppLayout>
  );
}
