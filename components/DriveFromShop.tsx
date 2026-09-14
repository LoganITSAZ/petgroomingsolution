import { driveToShop, formatDrive, routeUrl } from "@/lib/maps";

/**
 * Roughly how far an address is from the shop, by car.
 *
 * The counter asks it constantly — "can they get here before we close?" — and
 * it is the difference between a customer who will wait for a groom and one
 * who is coming back at five. Estimated, and it says so: OSRM routes a typical
 * day rather than this afternoon.
 *
 * Renders nothing at all when the address cannot be placed or the router is
 * unreachable. Same rule as the map: never worth a broken page.
 */
export default async function DriveFromShop({
  address,
  className = "",
}: {
  address: string | null | undefined;
  className?: string;
}) {
  const drive = await driveToShop(address);
  if (!drive) return null;

  return (
    <p className={`text-xs text-stone-500 ${className}`}>
      <span className="font-medium text-stone-700">{formatDrive(drive)}</span> from the shop
      {" · "}
      <a
        href={routeUrl(drive.from, drive.to)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-700 hover:text-amber-900 underline underline-offset-2"
      >
        route ↗
      </a>
      <span className="block text-stone-400">Estimated drive in typical traffic.</span>
    </p>
  );
}
