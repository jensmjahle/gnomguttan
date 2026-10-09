import { useState } from "react";

type Entry = { id: string; name: string; profile_image_url?: string; score: number };

function Avatar({ entry }: { entry: Entry }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return (
    <span className="ol-podium-avatar">
      {entry.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}
      {entry.profile_image_url && failedUrl !== entry.profile_image_url && (
        <img src={entry.profile_image_url} alt="" onError={() => setFailedUrl(entry.profile_image_url)} />
      )}
    </span>
  );
}

export function Podium({ title, entries, unit }: { title: string; entries: Entry[]; unit: string }) {
  return (
    <section className="ol-card ol-podium">
      <h2>{title}</h2>
      {entries.length ? (
        <ol className="ol-podium-places" aria-label={title}>
          {entries.slice(0, 3).map((entry, index) => (
            <li key={entry.id} className={`ol-podium-place ol-podium-place-${index + 1}`}>
              <Avatar entry={entry} />
              <span className="ol-podium-name" title={entry.name}>{entry.name}</span>
              <strong className="ol-podium-score">{entry.score.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unit}</strong>
              <span className="ol-podium-step"><span>{index + 1}<span className="sr-only">. plass</span></span></span>
            </li>
          ))}
        </ol>
      ) : <p>Ingen deltakere ennå.</p>}
    </section>
  );
}
