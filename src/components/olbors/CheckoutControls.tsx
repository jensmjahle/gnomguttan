import { useState } from "react";

type FeeRule = { field: string; operator: string; value: string; amount: number };
type RandomRule = { id: string; name: string; percent: number };
export type CheckoutSettings = {
  commissionMode: "fixed" | "profile"; fixedFee: number; commissionRules: FeeRule[];
  adjustmentsEnabled: boolean; graceMinutes: number; minimumPurchases: number;
  leaderDiscountPercent: number; lowBacThreshold: number; lowBacSurchargePercent: number;
  volumeThreshold: number; volumeDiscountPercent: number; lowVolumeThreshold: number; lowVolumeSurchargePercent: number;
  varietyThreshold: number; varietyDiscountPercent: number; lowVarietyThreshold: number; lowVarietySurchargePercent: number;
  randomEnabled: boolean; randomChancePercent: number; randomIntervalMinutes: number; randomRules: RandomRule[];
};
export type OfferSettings = { enabled: boolean; intervalMinutes: number; mode: "minimum" | "percent"; discountPercent: number; purchaseSlots: number; durationSeconds: number; excludedBeerIds: string[] };
export type SuperOffer = { id: string; beerId: string; price: number; remainingPurchases: number; ends_at: string };
export type PurchaseQuote = { id: string; expectedPrice: number; expiresAt: string; unitPrice: number; subtotal: number; commissionFee: number; adjustments: { name: string; percent: number }[]; adjustmentPercent: number; adjustedSubtotal: number; total: number; superOfferApplied: boolean };
const profileFields = [["work_relationship", "Arbeidsforhold"], ["marital_status", "Sivilstatus"], ["height", "Høyde (cm)"], ["weight", "Vekt (kg)"], ["shoe_size", "Skostørrelse"], ["gender", "Kjønn"], ["experience_level", "Erfaring"]];
export function CheckoutControls({ settings, busy, onSave }: { settings: CheckoutSettings; busy: boolean; onSave: (next: CheckoutSettings) => Promise<void> }) {
  const [config, setConfig] = useState(settings);
  const numeric = (key: keyof CheckoutSettings, label: string, min: number, max: number, step = "any") => <label>{label}<input type="number" min={min} max={max} step={step} required disabled={busy} value={Number(config[key])} onChange={(e) => setConfig({ ...config, [key]: Number(e.target.value) })} /></label>;
  return <form id="ol-admin-checkout" className="ol-card ol-checkout-controls" onSubmit={(e) => { e.preventDefault(); void onSave(config).catch(() => {}); }}>
    <h2>Kurtasje, rabatter og påslag</h2>
    <p>Kurtasje er faste kroner per kjøp, lagt til etter prosentvise rabatter og påslag. Deltakeren ser beløpet, men ingen forklaring på hvilke profilfelt som bestemte kurtasjen.</p>
    <div className="ol-admin-box">
      <h3>Kurtasje</h3>
      <div className="ol-pricing-fields"><label>Beregningsmåte<select aria-label="Beregningsmåte" value={config.commissionMode} disabled={busy} onChange={(e) => setConfig({ ...config, commissionMode: e.target.value as CheckoutSettings["commissionMode"] })}><option value="fixed">Fast beløp</option><option value="profile">Grunnbeløp + profilregler</option></select></label>{numeric("fixedFee", "Fast beløp / grunnbeløp (kr)", 0, 10000)}</div>
      {config.commissionMode === "profile" && <>
        <p>Alle regler som passer, legges sammen. Eksempel: Arbeidsforhold = Student → +1 kr; Fulltidsjobb → +2,50 kr; høyde &gt; 180 → +2 kr. Under/lik 180 kan få sin egen regel på +1 kr.</p>
        {config.commissionRules.map((rule, index) => <div className="ol-admin-rule" key={index}>
          <label>Profilfelt<select aria-label="Profilfelt" value={rule.field} disabled={busy} onChange={(e) => setConfig({ ...config, commissionRules: config.commissionRules.map((r, i) => i === index ? { ...r, field: e.target.value } : r) })}>{profileFields.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Vilkår<select aria-label="Vilkår" value={rule.operator} disabled={busy} onChange={(e) => setConfig({ ...config, commissionRules: config.commissionRules.map((r, i) => i === index ? { ...r, operator: e.target.value } : r) })}>{[["eq", "Er lik"], ["gt", "Større enn"], ["gte", "Større eller lik"], ["lt", "Mindre enn"], ["lte", "Mindre eller lik"]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Verdi<input value={rule.value} required disabled={busy} onChange={(e) => setConfig({ ...config, commissionRules: config.commissionRules.map((r, i) => i === index ? { ...r, value: e.target.value } : r) })} /></label>
          <label>Tillegg (kr)<input type="number" min="0" max="10000" step="any" required value={rule.amount} disabled={busy} onChange={(e) => setConfig({ ...config, commissionRules: config.commissionRules.map((r, i) => i === index ? { ...r, amount: Number(e.target.value) } : r) })} /></label>
          <button type="button" disabled={busy} onClick={() => setConfig({ ...config, commissionRules: config.commissionRules.filter((_, i) => i !== index) })}>Fjern regel</button>
        </div>)}
        <button type="button" disabled={busy || config.commissionRules.length >= 50} onClick={() => setConfig({ ...config, commissionRules: [...config.commissionRules, { field: "work_relationship", operator: "eq", value: "Student", amount: 1 }] })}>Legg til kurtasjeregel</button>
      </>}
    </div>
    <div className="ol-admin-box">
      <h3>Start rolig</h3><p>Rabatter og påslag begynner først når både ventetiden og antallet kjøp i børsen er nådd.</p>
      <div className="ol-pricing-fields">{numeric("graceMinutes", "Ventetid etter første kjøp (minutter)", 0, 1440)}{numeric("minimumPurchases", "Minst antall kjøp i børsen", 0, 1000, "1")}</div>
    </div>
    <div className="ol-admin-box">
      <h3>Deltakerrabatter og påslag</h3>
      <label className="ol-protection-toggle"><input type="checkbox" checked={config.adjustmentsEnabled} disabled={busy} onChange={(e) => setConfig({ ...config, adjustmentsEnabled: e.target.checked })} />Aktiver regler for promille, volum og variasjon</label>
      <p>Vises først i kjøpsvinduet, under kurtasjen. Positive prosentverdier er påslag; rabattene trekkes fra ølprisen.</p>
      <div className="ol-pricing-fields">
        {numeric("leaderDiscountPercent", "Rabatt for promilleleder (%)", 0, 90)}
        {numeric("lowBacThreshold", "Lav promille: under (‰)", 0, 10)}{numeric("lowBacSurchargePercent", "Påslag ved lav promille (%)", 0, 100)}
        {numeric("volumeThreshold", "Volumrabatt: minst kjøpt (L)", 0, 1000)}{numeric("volumeDiscountPercent", "Volumrabatt (%)", 0, 90)}
        {numeric("lowVolumeThreshold", "Lite kjøpt: under (L)", 0, 1000)}{numeric("lowVolumeSurchargePercent", "Påslag ved lite kjøpt (%)", 0, 100)}
        {numeric("varietyThreshold", "Variasjonsrabatt: minst ulike øl", 1, 1000, "1")}{numeric("varietyDiscountPercent", "Variasjonsrabatt (%)", 0, 90)}
        {numeric("lowVarietyThreshold", "Lite variasjon: maks ulike øl", 0, 1000, "1")}{numeric("lowVarietySurchargePercent", "Påslag ved lite variasjon (%)", 0, 100)}
      </div>
    </div>
    <div className="ol-admin-box">
      <h3>Tilfeldige rabatter og påslag</h3>
      <label className="ol-protection-toggle"><input type="checkbox" checked={config.randomEnabled} disabled={busy} onChange={(e) => setConfig({ ...config, randomEnabled: e.target.checked })} />Aktiver tilfeldige personlige tilbud</label>
      <p>Én tilfeldig regel kan treffe deltakeren per tidsperiode. Å åpne kjøpsvinduet på nytt trekker ikke en ny regel. Navnene er lekne merkelapper og trekkes uavhengig av profil og utseende.</p>
      <div className="ol-pricing-fields">{numeric("randomChancePercent", "Sjanse per deltaker (%)", 0, 100)}{numeric("randomIntervalMinutes", "Ny trekning etter (minutter)", 1, 1440)}</div>
      {config.randomRules.map((rule) => <div className="ol-admin-random-rule" key={rule.id}>
        <label>Navn<input value={rule.name} required maxLength={100} disabled={busy} onChange={(e) => setConfig({ ...config, randomRules: config.randomRules.map((r) => r.id === rule.id ? { ...r, name: e.target.value } : r) })} /></label>
        <label>Effekt (%)<input type="number" min="-90" max="100" step="any" required value={rule.percent} disabled={busy} onChange={(e) => setConfig({ ...config, randomRules: config.randomRules.map((r) => r.id === rule.id ? { ...r, percent: Number(e.target.value) } : r) })} /><small>Minus = rabatt, pluss = påslag.</small></label>
        <button type="button" disabled={busy} onClick={() => setConfig({ ...config, randomRules: config.randomRules.filter((r) => r.id !== rule.id) })}>Fjern</button>
      </div>)}
      <button type="button" disabled={busy || config.randomRules.length >= 50} onClick={() => setConfig({ ...config, randomRules: [...config.randomRules, { id: crypto.randomUUID(), name: "Ny rabatt", percent: -5 }] })}>Legg til rabatt eller påslag</button>
      <small>Samlet prosent begrenses til 90 % rabatt eller 100 % påslag. Kurtasjen påvirkes ikke av prosenten.</small>
    </div>
    <button disabled={busy}>Lagre kurtasje og rabatter</button>
  </form>;
}

export function SuperOfferControls({ settings, offer, beers, busy, onSave, onStart, onStop }: { settings: OfferSettings; offer: SuperOffer | null; beers: { id: string; name: string }[]; busy: boolean; onSave: (next: OfferSettings) => Promise<void>; onStart: () => Promise<void>; onStop: () => Promise<void> }) {
  const [config, setConfig] = useState(settings);
  return <section id="ol-admin-offers" className="ol-card ol-super-offer-controls">
    <h2>⚡ Supertilbud</h2>
    <p>En tilfeldig øl får et kraftig prisfall. Førstemann til mølla: hver deltaker kan bruke tilbudet én gang, og normalprisen gjenopprettes når antall tilbudskjøpere er nådd eller tiden er ute. Standard er én kjøper.</p>
    {offer && <div className="ol-admin-box"><strong>{beers.find((b) => b.id === offer.beerId)?.name} · {offer.price.toLocaleString("nb-NO")} kr/l</strong><p>{offer.remainingPurchases} tilbudskjøpere igjen</p><button disabled={busy} onClick={() => void onStop().catch(() => {})}>Avslutt supertilbud</button></div>}
    <form onSubmit={(e) => { e.preventDefault(); void onSave(config).catch(() => {}); }}>
      <label className="ol-protection-toggle"><input type="checkbox" checked={config.enabled} disabled={busy} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} />Aktiver automatiske supertilbud</label>
      <div className="ol-pricing-fields">
        <label>Hyppighet (minutter)<input type="number" min="1" max="1440" step="any" required value={config.intervalMinutes} disabled={busy} onChange={(e) => setConfig({ ...config, intervalMinutes: Number(e.target.value) })} /></label>
        <label>Tilbudspris<select value={config.mode} disabled={busy} onChange={(e) => setConfig({ ...config, mode: e.target.value as OfferSettings["mode"] })}><option value="minimum">Ølets minstepris</option><option value="percent">Prosent avslag på gjeldende pris</option></select></label>
        <label>Prisfall (%)<input type="number" min="1" max="90" step="any" required value={config.discountPercent} disabled={busy || config.mode === "minimum"} onChange={(e) => setConfig({ ...config, discountPercent: Number(e.target.value) })} /></label>
        <label>Antall tilbudskjøpere<input type="number" min="1" max="100" step="1" required value={config.purchaseSlots} disabled={busy} onChange={(e) => setConfig({ ...config, purchaseSlots: Number(e.target.value) })} /></label>
        <label>Maks varighet (sekunder)<input type="number" min="10" max="3600" step="any" required value={config.durationSeconds} disabled={busy} onChange={(e) => setConfig({ ...config, durationSeconds: Number(e.target.value) })} /></label>
      </div>
      <fieldset><legend>Øl som aldri skal få supertilbud</legend><div className="ol-offer-exclusions">{beers.map((beer) => <label key={beer.id}><input type="checkbox" checked={config.excludedBeerIds.includes(beer.id)} disabled={busy} onChange={(e) => setConfig({ ...config, excludedBeerIds: e.target.checked ? [...config.excludedBeerIds, beer.id] : config.excludedBeerIds.filter((id) => id !== beer.id) })} />{beer.name}</label>)}</div></fieldset>
      <p>Min-/makspris og tapsvern gjelder. Prisfall og gjenoppretting lagres umiddelbart i prishistorikken.</p>
      <div className="ol-actions"><button disabled={busy}>Lagre supertilbud</button><button type="button" disabled={busy || Boolean(offer)} onClick={() => void onStart().catch(() => {})}>Trekk supertilbud nå</button></div>
    </form>
  </section>;
}
