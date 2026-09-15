import { prisma } from "@/lib/prisma";
import { cache } from "react";
import { type Drive, type GeoPoint, stripUnit } from "@/lib/map-urls";
import { getConfig } from "@/lib/config";

export {
  directionsUrl,
  embedUrl,
  formatDrive,
  routeUrl,
  searchUrl,
  stripUnit,
  type Drive,
  type GeoPoint,
} from "@/lib/map-urls";

/**
 * Maps, without an API key or an account.
 *
 * Addresses are geocoded through OpenStreetMap's Nominatim and the result is
 * kept in Postgres for good. Nominatim's usage policy allows roughly one
 * request a second and asks for an identifying User-Agent — a shop has a
 * handful of addresses, so after the first render everything is served from
 * the cache and no request goes out at all.
 *
 * Nothing here throws or blocks a page: a lookup that fails, times out, or
 * finds nothing is remembered as a miss, and the caller falls back to showing
 * the address as text with a link. A map is never worth a broken page.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const LOOKUP_TIMEOUT_MS = 3000;
/** How long before a failed lookup is worth trying again. */
const MISS_RETRY_MS = 24 * 60 * 60 * 1000;

/** Normalised cache key — whitespace and case must not split the cache. */
function keyFor(address: string): string {
  return address.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Coordinates for an address, from the cache when we have them.
 *
 * `cache()` collapses repeat lookups within one render — the shop address
 * appears in the footer and the body of the same page.
 */
export const geocode = cache(async function geocode(
  address: string | null | undefined
): Promise<GeoPoint | null> {
  if (!address || address.trim() === "") return null;
  const key = keyFor(address);

  const hit = await prisma.geocodeCache.findUnique({ where: { query: key } });
  if (hit) {
    if (hit.lat !== null && hit.lon !== null) {
      return { lat: hit.lat, lon: hit.lon, label: hit.label ?? address };
    }
    // A remembered miss. Leave it alone until it is worth another try.
    if (Date.now() - hit.checkedAt.getTime() < MISS_RETRY_MS) return null;
  }

  const found = await place(address);

  await prisma.geocodeCache.upsert({
    where: { query: key },
    create: {
      query: key,
      lat: found?.lat ?? null,
      lon: found?.lon ?? null,
      label: found?.label ?? null,
    },
    update: {
      lat: found?.lat ?? null,
      lon: found?.lon ?? null,
      label: found?.label ?? null,
      checkedAt: new Date(),
    },
  });

  return found;
});

/**
 * Unit numbers are how a shop writes its address and not how a map indexes it:
 * "8911 N Central Ave #104" finds nothing, "8911 N Central Ave" finds the
 * building. Try what was typed, then the same line without the unit.
 */
async function place(address: string): Promise<GeoPoint | null> {
  const direct = await lookup(address);
  if (direct) return direct;

  const withoutUnit = stripUnit(address);
  if (withoutUnit === address) return null;

  // Nominatim asks for no more than a request a second.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  return lookup(withoutUnit);
}

/** One Nominatim call. Returns null on any failure — never throws. */
async function lookup(address: string): Promise<GeoPoint | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(address)}&format=jsonv2&limit=1`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Nominatim's policy asks callers to identify themselves.
        "User-Agent": "GentleGroomer/1.0 (shop management app; self-hosted)",
        "Accept-Language": "en",
      },
      // The cache row is the cache; do not also hold this in the fetch cache.
      cache: "no-store",
    });
    if (!response.ok) return null;

    const results = (await response.json()) as {
      lat?: string;
      lon?: string;
      display_name?: string;
    }[];
    const first = Array.isArray(results) ? results[0] : undefined;
    if (!first?.lat || !first?.lon) return null;

    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return { lat, lon, label: first.display_name ?? address };
  } catch {
    // Offline, blocked, rate-limited or too slow. The caller shows text.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const OSRM = "https://router.project-osrm.org/route/v1/driving";

/*
 * Routes are held for the life of the process, not in Postgres.
 *
 * A geocode is worth a table because the answer is permanent; a drive between
 * two fixed points is cheap to ask for again and the roads do occasionally
 * change. One app instance is the deployment (see lib/station-events.ts), so a
 * module-level map is the whole cache.
 *
 * ponytail: in-process cache, move it to a table if OSRM ever rate-limits us.
 */
const routes = new Map<string, Drive>();

/**
 * How long it takes to drive from an address to the shop.
 *
 * Keyless, like the rest of the map layer: OSRM's public router takes the two
 * points the geocoder already found. It is a typical-traffic estimate and is
 * labelled as one wherever it is shown — never a promise about a given
 * morning.
 *
 * Returns null whenever anything is missing or slow, same contract as
 * `geocode()`: no throwing, and the caller simply shows one line less.
 */
export const driveToShop = cache(async function driveToShop(
  address: string | null | undefined
): Promise<(Drive & { from: GeoPoint; to: GeoPoint }) | null> {
  if (!address || address.trim() === "") return null;

  const config = await getConfig();
  const [from, to] = await Promise.all([geocode(address), geocode(config.shopAddress)]);
  if (!from || !to) return null;

  // Only an answer is cached. Caching the miss too meant one OSRM timeout hid
  // that customer's drive time until the process restarted; `cache()` above
  // already collapses a failed lookup to one call per request, and the next
  // render simply asks again.
  const key = `${from.lat},${from.lon};${to.lat},${to.lon}`;
  let drive = routes.get(key) ?? null;
  if (!drive) {
    drive = await route(from, to);
    if (drive) routes.set(key, drive);
  }

  return drive && { ...drive, from, to };
});

/** One OSRM call. Returns null on any failure — never throws. */
async function route(from: GeoPoint, to: GeoPoint): Promise<Drive | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const pair = `${from.lon},${from.lat};${to.lon},${to.lat}`;
    const response = await fetch(`${OSRM}/${pair}?overview=false`, {
      signal: controller.signal,
      headers: { "User-Agent": "GentleGroomer/1.0 (shop management app; self-hosted)" },
      cache: "no-store",
    });
    if (!response.ok) return null;

    const body = (await response.json()) as {
      code?: string;
      routes?: { distance?: number; duration?: number }[];
    };
    const first = body.code === "Ok" ? body.routes?.[0] : undefined;
    if (!Number.isFinite(first?.distance) || !Number.isFinite(first?.duration)) return null;

    return { metres: first!.distance!, seconds: first!.duration! };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
