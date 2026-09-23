/**
 * Building map URLs, and reading an address the way a shop writes one.
 *
 * Kept apart from [lib/maps.ts](lib/maps.ts) because none of this touches the
 * network, the database or React — which is what makes it testable.
 */

/** A place on the map. Two ends of a route need no label. */
export type Coords = { lat: number; lon: number };

export interface GeoPoint extends Coords {
  label: string;
  /**
   * The place's own parts, as the geocoder resolved them. A shop writes
   * "8911 N Central Ave #104 Phoenix, AZ 85020" with one comma in it, so the
   * city cannot be read off the line reliably — but the map already knows it.
   */
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
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

/** A driving estimate between two points. Distance is metres, time is seconds. */
export interface Drive {
  metres: number;
  seconds: number;
}

/**
 * How the shop says a drive out loud: "12 min · 5.4 mi".
 *
 * Rounded hard on purpose — this is a routing engine's guess at an average
 * day, not a departure time. Under a minute still reads as "1 min", because
 * "0 min" looks like a bug.
 */
export function formatDrive({ metres, seconds }: Drive): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const time = minutes >= 60
    ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`
    : `${minutes} min`;
  const miles = metres / 1609.344;
  return `${time} · ${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

/** Directions between two points, opened on openstreetmap.org. */
export function routeUrl(from: Coords, to: Coords): string {
  const at = (point: Coords) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${at(from)};${at(to)}`;
}
