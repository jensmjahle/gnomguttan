import type { CSSProperties } from "react";

export function LiveIndicator({
  status,
  connected,
}: {
  status: string;
  connected: boolean;
}) {
  const live = status === "live" && connected;
  const label = !connected
    ? "Frakoblet"
    : live
      ? "Live"
      : status === "closed"
        ? "Avsluttet"
        : "Klargjøres";
  return (
    <span className={`ol-live ${live ? "is-live" : ""}`} role="status">
      <span className="ol-live-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function PriceRange({
  name,
  price,
  min,
  max,
  base,
}: {
  name: string;
  price: number;
  min: number;
  max: number;
  base: number;
}) {
  const percent =
    max > min
      ? Math.max(0, Math.min(100, ((price - min) / (max - min)) * 100))
      : 50;
  const basePercent =
    max > min
      ? Math.max(0, Math.min(100, ((base - min) / (max - min)) * 100))
      : 50;
  const color =
    percent < 20
      ? "#ef6461"
      : percent < 40
        ? "#f59e42"
        : percent < 60
          ? "#e6bc35"
          : percent < 80
            ? "#a3bd36"
            : "#27aa72";
  const fmt = (n: number) =>
    n.toLocaleString("nb-NO", { maximumFractionDigits: 1 });
  return (
    <div
      className="ol-range"
      style={{ "--range-color": color } as CSSProperties}
    >
      <div
        className="ol-range-track"
        role="meter"
        aria-label={`Priskurs for ${name}`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={price}
        aria-valuetext={`${fmt(price)} kroner per liter, mellom ${fmt(min)} og ${fmt(max)}`}
      >
        <span className="ol-range-fill" style={{ width: `${percent}%` }} />
        <span
          className="ol-range-base"
          style={{ left: `${basePercent}%` }}
          title={`Grunnpris ${fmt(base)} kr/l`}
        />
        <span className="ol-range-thumb" style={{ left: `${percent}%` }} />
      </div>
      <div className="ol-range-labels">
        <span>
          {fmt(min)} <small>min</small>
        </span>
        <span>
          {fmt(max)} <small>maks</small>
        </span>
      </div>
    </div>
  );
}
