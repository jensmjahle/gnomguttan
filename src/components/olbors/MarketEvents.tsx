import { useEffect, useState, type FormEvent } from "react";

export type MarketEvent = { id: string; type: "crash" | "surge"; percent: number; started_at: string; ends_at: string; source: string };
export type MarketSettings = {
  profitCrashEnabled: boolean; profitTriggerMode: "amount" | "percent"; profitTriggerAmount: number; profitTriggerPercent: number;
  randomEventsEnabled: boolean; randomIntervalMinutes: number; randomChancePercent: number; randomEventType: "crash" | "surge" | "mixed";
  crashPercent: number; surgePercent: number; durationSeconds: number; cooldownSeconds: number;
};
export function MarketEventBanner({ event }: { event: MarketEvent }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const remaining = Math.max(0, Math.ceil((Date.parse(event.ends_at) - now) / 1000));
  return <div className={`ol-market-event-banner ol-market-event-${event.type}`} role="status">
    <strong>{event.type === "crash" ? "↘ Børscrack" : "↗ Prisboom"} · {event.type === "crash" ? "−" : "+"}{event.percent}%</strong>
    <span>{remaining ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} igjen` : "Tilbake til normalmarkedet straks"}</span>
  </div>;
}
const numbers: { key: keyof Omit<MarketSettings, "profitCrashEnabled" | "profitTriggerMode" | "randomEventsEnabled" | "randomEventType">; label: string; min: number; max: number }[] = [
  { key: "crashPercent", label: "Prisfall ved børscrack (%)", min: 1, max: 90 },
  { key: "surgePercent", label: "Prisøkning ved boom (%)", min: 1, max: 200 },
  { key: "durationSeconds", label: "Varighet (sekunder)", min: 10, max: 3600 },
  { key: "cooldownSeconds", label: "Pause mellom automatiske hendelser (sekunder)", min: 10, max: 86400 },
  { key: "profitTriggerAmount", label: "Overskudd før crack (kr)", min: 1, max: 1000000 },
  { key: "profitTriggerPercent", label: "Overskudd før crack (% av solgt kostnad)", min: .1, max: 1000 },
  { key: "randomIntervalMinutes", label: "Intervall for tilfeldig trekning (minutter)", min: 1, max: 1440 },
  { key: "randomChancePercent", label: "Sjanse per trekning (%)", min: 0, max: 100 },
];
const fieldHelp: Record<string, string> = {
  crashPercent: "Prosent av gjeldende normalpris som trekkes fra. Ølets minstepris stopper fallet.",
  surgePercent: "Prosent som legges på normalprisen. Ølets makspris stopper økningen.",
  durationSeconds: "Hvor lenge prisendringen varer før normalmarkedet kommer tilbake.",
  cooldownSeconds: "Minste pause etter en hendelse før en ny automatisk hendelse kan starte.",
  profitTriggerAmount: "Nytt netto overskudd huset må tjene siden forrige hendelse før et krakk utløses.",
  profitTriggerPercent: "Nytt overskudd som prosent av kostnaden for ølet solgt siden forrige hendelse.",
  randomIntervalMinutes: "Hvor ofte det trekkes om en tilfeldig hendelse skal starte. Ikke en garanti for en hendelse hver gang.",
  randomChancePercent: "Sannsynligheten for at hver trekning starter en hendelse. 100 % betyr hver tilgjengelige trekning.",
};
export function MarketEventControls({ settings, event, busy, onSave, onStart, onStop }: {
  settings: MarketSettings; event: MarketEvent | null; busy: boolean;
  onSave: (settings: MarketSettings) => Promise<void>;
  onStart: (type: "crash" | "surge", percent: number, durationSeconds: number) => Promise<void>;
  onStop: () => Promise<void>;
}) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), command = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "save";
    const next = { ...settings, profitCrashEnabled: form.get("profitCrashEnabled") === "on", randomEventsEnabled: form.get("randomEventsEnabled") === "on", profitTriggerMode: form.get("profitTriggerMode") as MarketSettings["profitTriggerMode"], randomEventType: form.get("randomEventType") as MarketSettings["randomEventType"] };
    for (const field of numbers) next[field.key] = Number(form.get(field.key));
    try {
      if (command === "crash" || command === "surge") await onStart(command, command === "crash" ? next.crashPercent : next.surgePercent, next.durationSeconds);
      else await onSave(next);
    } catch { /* The page shows the API error. */ }
  };
  return <section id="ol-admin-events" className="ol-card ol-market-event-controls">
    <h2>Markedshendelser</h2>
    <p>Start et midlertidig prisfall eller prishopp. Markedet fortsetter å reagere på kjøp underveis og går tilbake til normalprisene etterpå.</p>
    {event && <><MarketEventBanner event={event} /><button disabled={busy} onClick={() => void onStop().catch(() => {})}>Avslutt hendelsen nå</button></>}
    <form onSubmit={(event) => void submit(event)}>
      <div className="ol-admin-event-boxes">{(["crash", "surge"] as const).map((type) => <div className={`ol-admin-box ol-admin-event-${type}`} key={type}>
        <div className="ol-admin-event-heading"><span className="ol-admin-event-icon" aria-hidden="true">{type === "crash" ? "↘" : "↗"}</span><div><span className="ol-admin-event-eyebrow">{type === "crash" ? "Midlertidig prisfall" : "Midlertidig prisoppgang"}</span><h3>{type === "crash" ? "Børskrakk" : "Børsboom"}</h3></div></div>
        <p>{type === "crash" ? "Alle øl faller midlertidig i pris. Juster hvor stort fallet skal være. Kan startes manuelt, tilfeldig eller etter nytt overskudd." : "Alle øl stiger midlertidig i pris. Juster påslaget. Kan startes manuelt eller som tilfeldig hendelse."}</p>
        {numbers.filter((field) => field.key === (type === "crash" ? "crashPercent" : "surgePercent")).map((field) => <label key={field.key}>{field.label}<input name={field.key} type="number" min={field.min} max={field.max} step="any" required disabled={busy} defaultValue={settings[field.key]} /><small>{fieldHelp[field.key]}</small></label>)}
        <p className="ol-admin-event-return">Etterpå: tilbake til normalprisene, justert etter kjøp underveis. Varighet og automatiske utløsere velges nedenfor.</p>
        <button value={type} disabled={busy || Boolean(event)}>{type === "crash" ? "Start børscrack" : "Start prisboom"}</button>
      </div>)}</div>
      <div className="ol-admin-box"><h3>Varighet og automatiske utløsere</h3><p>Begge hendelser varer tiden du velger. Etterpå gjenopprettes normalprisene, med kjøp underveis tatt med. Pausen hindrer hendelser tett etter hverandre.</p>
      <div className="ol-pricing-fields">{numbers.filter((field) => !["crashPercent", "surgePercent"].includes(field.key)).map((field) => <label key={field.key}>{field.label}<input name={field.key} type="number" min={field.min} max={field.max} step="any" required disabled={busy} defaultValue={settings[field.key]} /><small>{fieldHelp[field.key]}</small></label>)}</div>
      <label className="ol-protection-toggle"><input name="profitCrashEnabled" type="checkbox" defaultChecked={settings.profitCrashEnabled} disabled={busy} />Automatisk crack ved overskudd</label>
      <label>Utløs overskuddshendelse etter<select name="profitTriggerMode" defaultValue={settings.profitTriggerMode} disabled={busy}><option value="amount">Beløp i kroner</option><option value="percent">Prosent av kostnaden</option></select></label>
      <p>Teller nytt netto overskudd siden forrige hendelse. Prosent krever nye registrerte salg; uten salg starter ikke samme overskudd et nytt crack.</p>
      <label className="ol-protection-toggle"><input name="randomEventsEnabled" type="checkbox" defaultChecked={settings.randomEventsEnabled} disabled={busy} />Tilfeldige markedshendelser</label>
      <label>Type ved tilfeldig trekning<select name="randomEventType" defaultValue={settings.randomEventType} disabled={busy}><option value="mixed">Både crack og boom</option><option value="crash">Bare børscrack</option><option value="surge">Bare prisboom</option></select></label>
      <p>Automatikk er av som standard. Minste- og makspris gjelder alltid. Tapsvernet kan avslutte et crack tidlig.</p>
      </div><div className="ol-actions"><button value="save" disabled={busy}>Lagre hendelsesregler</button></div>
    </form>
  </section>;
}
