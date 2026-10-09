import { type FormEvent } from "react";

export type PricingSettings = {
  aggressionPercent: number; maxChangePercent: number; reversionPercent: number;
  lossLimit: number; recoveryMarkupPercent: number; houseProtection: boolean;
  crossImpactPercent: number; targetMarginPercent: number; marginResponsePercent: number;
};
export type House = { revenue: number; cost: number; balance: number; estimatedReceipts: number; emergency: boolean };
const fields: { key: keyof Omit<PricingSettings, "houseProtection">; label: string; help: string; min: number; max: number }[] = [
  { key: "aggressionPercent", label: "Prisfølsomhet (%)", help: "Prisøkning per 500 ml kjøpt, som prosent av grunnprisen. 0 slår av kjøpstrykket.", min: 0, max: 30 },
  { key: "crossImpactPercent", label: "Kobling mellom ølene (%)", help: "Hvor mye av økningen som fordeles som prisfall på de andre ølene. 100% fordeler hele økningen; 0 gir ingen direkte reduksjon.", min: 0, max: 300 },
  { key: "targetMarginPercent", label: "Mål for husets overskudd (%)", help: "Ønsket overskudd i prosent av kostnaden for solgt øl. Standard er 5%.", min: 0, max: 50 },
  { key: "marginResponsePercent", label: "Styrke på husets prisregulering (%)", help: "Justerer styrken uten å snu markedet: kjøpt øl stiger, andre faller. Ved underskudd øker kjøpt øl mer og andre faller mindre. Tapsvern kan heve prisgulvene.", min: 0, max: 30 },
  { key: "maxChangePercent", label: "Maks normal prisendring (%)", help: "Største endring per kjøp. Tapsvernet kan gjøre større hopp.", min: 0.1, max: 50 },
  { key: "reversionPercent", label: "Tilbake mot grunnpris (%)", help: "Andel av prisavviket som hentes inn per kjøp for øl som ikke kjøpes.", min: 0, max: 20 },
  { key: "lossLimit", label: "Tapsgrense for huset (kr)", help: "Hvis et kjøp vil øke tapet forbi grensen, heves prisene før ny bekreftelse. 0 tillater ikke tap.", min: 0, max: 1000000 },
  { key: "recoveryMarkupPercent", label: "Påslag ved tapsvern (%)", help: "Prisgulv over innkjøpspris ved tiltak. Ølenes makspris gjelder fortsatt.", min: 0, max: 100 },
];
const money = (n: number) => n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function HouseSummary({ house }: { house: House }) {
  return <section className="ol-card ol-house-summary" aria-label="Husets økonomi">
    <h2>Husets økonomi</h2>
    <p>Totalt for hele børsen, basert på alle registrerte kjøp.</p>
    <dl className="ol-final-metrics">
      <div><dt>Brutto omsetning</dt><dd>{money(house.revenue)} kr</dd><small>Alle innbetalinger, inkludert kurtasje</small></div>
      <div><dt>Varekost</dt><dd>{money(house.cost)} kr</dd><small>Innkjøpskostnaden for solgt øl</small></div>
      <div><dt>Netto fortjeneste</dt><dd className={house.balance < 0 ? "ol-down" : "ol-up"}>{money(house.balance)} kr</dd><small>{house.revenue > 0 ? `${money(house.balance / house.revenue * 100)} % av omsetningen` : "Ingen omsetning ennå"}</small></div>
    </dl>
    <p>Netto = brutto omsetning − varekost. Øvrige utgifter, skatt og usolgt lager inngår ikke.</p>
    {house.estimatedReceipts > 0 && <p>{house.estimatedReceipts} kjøp har estimert kostnad basert på grunnpris. Legg inn innkjøpspris under «Administrer øl» for presise kostnader på nye kjøp.</p>}
  </section>;
}
export function PricingControls({ settings, house, busy, onSave }: {
  settings: PricingSettings; house: House; busy: boolean; onSave: (settings: PricingSettings) => Promise<void>;
}) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const next = { ...settings, houseProtection: form.get("houseProtection") === "on" };
    for (const field of fields) next[field.key] = Number(form.get(field.key));
    try { await onSave(next); } catch { /* The page displays the API error. */ }
  };
  return <section id="ol-admin-pricing" className="ol-card ol-pricing-controls">
    <h2>Prisalgoritme og tapsvern</h2>
    <p>{house.emergency ? "Tapsvern aktivt. Prisgulvet beholdes til minst halvparten av tapsgrensen er hentet inn." : "Normal prisjustering."}</p>
    <form onSubmit={(event) => void submit(event)}>
      <div className="ol-pricing-fields">{fields.map((field) => <label key={field.key}>
        {field.label}<input name={field.key} type="number" min={field.min} max={field.max} step="any" required defaultValue={settings[field.key]} disabled={busy} />
        <small>{field.help}</small>
      </label>)}</div>
      <label className="ol-protection-toggle"><input name="houseProtection" type="checkbox" defaultChecked={settings.houseProtection} disabled={busy} />Aktiver tapsvern</label>
      <p>Uten tapsvern kan huset tape mer enn tapsgrensen. Hvis makspris er lavere enn kostnaden, stoppes kjøp som ville økt tapet forbi grensen.</p>
      <button disabled={busy}>Lagre prisregler</button>
    </form>
  </section>;
}
