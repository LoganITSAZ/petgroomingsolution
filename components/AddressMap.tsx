import { directionsUrl, embedUrl, geocode, searchUrl } from "@/lib/maps";

/**
 * An address, shown as a place.
 *
 * Degrades in one step: if the address cannot be geocoded — offline, blocked,
 * rate-limited, or simply not found — the map is dropped and the address stays
 * readable with a link out. A map is never worth a broken page, so nothing
 * here can throw.
 */

interface AddressMapProps {
  address: string | null | undefined;
  /** Height of the map frame. Kiosk screens want more. */
  height?: number;
  /** Show the address text above the map. Off where the page already prints it. */
  showAddress?: boolean;
  /** Screen-reader name for the frame; say which place it shows. */
  title: string;
  className?: string;
  compact?: boolean;
  /** Let the map break through a padded parent card to become a feature. */
  edgeToEdge?: boolean;
}

export default async function AddressMap({
  address,
  height = 220,
  showAddress = false,
  title,
  className = "",
  compact = false,
  edgeToEdge = false,
}: AddressMapProps) {
  if (!address || address.trim() === "") return null;

  const point = await geocode(address);

  // Could not be placed: the address is still the useful part.
  if (!point) {
    return (
      <div className={className}>
        {showAddress && <p className="text-sm text-stone-600">{address}</p>}
        <a
          href={searchUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-amber-700 hover:text-amber-900 underline"
        >
          Find on a map ↗
        </a>
      </div>
    );
  }

  return (
    <div className={className}>
      {showAddress && <p className="text-sm text-stone-600 mb-1.5">{address}</p>}

      <div
        className={
          edgeToEdge
            ? "-mx-7 overflow-hidden border-y border-line bg-page md:-mx-10"
            : "overflow-hidden rounded-xl border border-line bg-page"
        }
      >
        <iframe
          title={title}
          src={embedUrl(point, compact ? 0.002 : undefined)}
          height={height}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full block border-0"
        />
      </div>

      <div className={edgeToEdge ? "mt-3 flex gap-3 px-7 md:px-10" : "mt-1.5 flex gap-3"}>
        <a
          href={directionsUrl(point)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-brand-text hover:underline"
        >
          Get directions ↗
        </a>
        <a
          href={searchUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted hover:text-brand-text underline"
        >
          Open larger map ↗
        </a>
      </div>
    </div>
  );
}
