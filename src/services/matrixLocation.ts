export type SharedLocation = { latitude: number; longitude: number; accuracy?: number };

export function parseGeoUri(value: unknown): SharedLocation | null {
  if (typeof value !== 'string') return null;
  const match = /^geo:([+-]?(?:\d+(?:\.\d*)?|\.\d+)),([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:,[+-]?(?:\d+(?:\.\d*)?|\.\d+))?((?:;[^\s;]+)*)$/i.exec(value.trim());
  if (!match) return null;
  const latitude = Number(match[1]); const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const params = new URLSearchParams(match[3].replace(/^;/, '').replace(/;/g, '&'));
  if (params.has('crs') && params.get('crs')?.toLowerCase() !== 'wgs84') return null;
  const uncertainty = params.get('u');
  const accuracy = uncertainty !== null && uncertainty !== '' ? Number(uncertainty) : undefined;
  if (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0)) return null;
  return { latitude, longitude, accuracy };
}
