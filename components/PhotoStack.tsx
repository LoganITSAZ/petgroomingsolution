/* eslint-disable @next/next/no-img-element */

/**
 * The pet in front, the owner tucked behind it.
 *
 * Hovering expands both into a panel that is absolutely positioned, so nothing
 * on the page moves. Pure CSS — no client component, no layout shift.
 */
export default function PhotoStack({
  petPhotoUrl,
  petName,
  ownerPhotoUrl,
  ownerName,
  size = 56,
}: {
  petPhotoUrl: string | null;
  petName: string;
  ownerPhotoUrl: string | null;
  ownerName: string;
  size?: number;
}) {
  if (!petPhotoUrl && !ownerPhotoUrl) return null;

  const initials = (value: string) =>
    value
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <span
      className="relative inline-block group"
      tabIndex={0}
      role="img"
      aria-label={`${petName}, owned by ${ownerName}`}
      style={{ width: size * 1.35, height: size }}
    >
      {/* Owner, behind and offset so a slice always shows */}
      {ownerPhotoUrl ? (
        <img
          src={ownerPhotoUrl}
          alt=""
          className="absolute top-0 right-0 rounded-full object-cover border-2 border-white shadow-sm"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          className="absolute top-0 right-0 rounded-full border-2 border-white bg-stone-200 text-stone-500 text-xs font-bold flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          {initials(ownerName)}
        </span>
      )}

      {/* Pet, in front */}
      {petPhotoUrl ? (
        <img
          src={petPhotoUrl}
          alt=""
          className="absolute top-0 left-0 rounded-full object-cover border-2 border-white shadow"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          className="absolute top-0 left-0 rounded-full border-2 border-white bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center shadow"
          style={{ width: size, height: size }}
        >
          {initials(petName)}
        </span>
      )}

      {/* Expanded view: absolute, so the page never reflows */}
      <span
        className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden group-hover:flex group-focus:flex gap-2 bg-white border border-stone-200 rounded-xl p-2 shadow-xl"
        role="presentation"
      >
        {petPhotoUrl && (
          <span className="block text-center">
            <img
              src={petPhotoUrl}
              alt=""
              className="w-40 h-40 rounded-lg object-cover"
            />
            <span className="block text-xs text-stone-500 mt-1">{petName}</span>
          </span>
        )}
        {ownerPhotoUrl && (
          <span className="block text-center">
            <img
              src={ownerPhotoUrl}
              alt=""
              className="w-40 h-40 rounded-lg object-cover"
            />
            <span className="block text-xs text-stone-500 mt-1">{ownerName}</span>
          </span>
        )}
      </span>
    </span>
  );
}
