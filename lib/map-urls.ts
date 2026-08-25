/**
 * Building map URLs, and reading an address the way a shop writes one.
 *
 * Kept apart from [lib/maps.ts](lib/maps.ts) because none of this touches the
 * network, the database or React — which is what makes it testable.
 */

export interface GeoPoint {
  lat: number;
  lon: number;
  label: string;
}

/** Drop "#104", "Apt 3", "Suite B", "Unit 5" and friends from an address. */
export function stripUnit(address: string): string {
  return address
    .replace(/(^|[\s,])#\s*[\w-]+/gi, "")
    // \b after the keyword matters: without it "fl" eats the start of
    // "Floral Way" and the street disappears.
    .replace(/(^|[\s,])(apt|apartment|suite|ste|unit|bldg|building|fl|floor|rm|room)\b\.?\s*#?\s*[\w-]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .trim()
    .replace(/^,|,$/g, "")
    .trim();
}

/** Half-width of the embedded map's box, in degrees. Roughly 400m of street. */
const BOX = 0.004;

/** Keyless OpenStreetMap iframe centred on a point, with a marker on it. */
export function embedUrl({ lat, lon }: GeoPoint, spread: number = BOX): string {
  const bbox = [lon - spread, lat - spread, lon + spread, lat + spread]
    .map((value) => value.toFixed(6))
    .join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

/** Directions to a point, opened on openstreetmap.org. */
export function directionsUrl(point: GeoPoint): string {
  return `https://www.openstreetmap.org/directions?to=${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
}

/** Search link for an address we could not place — still useful to a reader. */
export function searchUrl(address: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`;
}
