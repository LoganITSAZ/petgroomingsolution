import { directionsUrl, geocode, searchUrl } from "@/lib/maps";

/**
 * An address with a way to get there, and no map frame.
 *
 * For rows and side panels where an iframe would be too heavy — a staff list,
 * a card beside a booking. Same graceful fallback as
 * [AddressMap](components/AddressMap.tsx): if the address cannot be placed,
 * the link still searches for it.
 */
export default async function AddressLink({
  address,
  className = "",
}: {
  address: string | null | undefined;
  className?: string;
}) {
  if (!address || address.trim() === "") return null;

  const point = await geocode(address);

  return (
    <span className={className}>
      <span className="text-stone-700">{address}</span>{" "}
      <a
        href={point ? directionsUrl(point) : searchUrl(address)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
      >
        {point ? "directions ↗" : "find ↗"}
      </a>
    </span>
  );
}
