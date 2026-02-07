// Lightweight geospatial helpers with no external deps

// Approx meters per degree latitude
const METERS_PER_DEG_LAT = 111_320; // ~111.32km per degree

// Degrees longitude shrink by cos(latitude)
const metersPerDegLon = (latDeg: number) => METERS_PER_DEG_LAT * Math.cos((latDeg * Math.PI) / 180);

// Quantize a lat/lon into a grid cell key about `meters` wide/high.
// Simpler than geohash and plenty fast for client-side dedup.
export function quantizeCell(lat: number, lon: number, meters = 12): string {
  const latStep = meters / METERS_PER_DEG_LAT;
  const lonStep = meters / metersPerDegLon(lat);
  const latIdx = Math.floor(lat / latStep);
  const lonIdx = Math.floor(lon / lonStep);
  return `${latIdx}:${lonIdx}:${meters}`;
}

export function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371_000; // meters
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat2 = Math.sin(dLat / 2);
  const sinDLon2 = Math.sin(dLon / 2);
  const h = sinDLat2 * sinDLat2 + Math.cos(lat1) * Math.cos(lat2) * sinDLon2 * sinDLon2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
