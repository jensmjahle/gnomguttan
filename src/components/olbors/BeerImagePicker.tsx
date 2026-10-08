import { useState } from "react";
import { beerIcons } from "./beerIcons";

export const defaultBeerIcon = "/icons/olbors/047-beer-mug.png";

export function BeerImagePicker({ initialImage }: { initialImage?: string }) {
  const [selected, setSelected] = useState(initialImage || defaultBeerIcon);
  const [uploadSelected, setUploadSelected] = useState(false);
  return (
    <div className="ol-image-picker">
      <input type="hidden" name="image_url" value={selected} />
      <div className="ol-image-preview">
        <img src={selected} alt="Valgt bilde for ølet" />
        <span>{uploadSelected ? "Bildet du laster opp brukes ved lagring." : "Valgt bilde"}</span>
      </div>
      <details>
        <summary>Velg ikon ({beerIcons.length})</summary>
        <div className="ol-icon-options" role="group" aria-label="Ølikoner">
          {beerIcons.map((name, index) => {
            const url = `/icons/olbors/${name}`;
            return (
              <button key={name} type="button" aria-label={`Velg ikon ${index + 1}`}
                aria-pressed={selected === url} title={name}
                onClick={() => setSelected(url)}>
                <img src={url} alt="" loading="lazy" />
              </button>
            );
          })}
        </div>
      </details>
      <label>Last opp bilde
        <input name="image" type="file" accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setUploadSelected(Boolean(e.target.files?.length))} />
      </label>
      <small>Velg et ikon eller last opp ditt eget bilde. Opplastet bilde har prioritet.</small>
    </div>
  );
}
