/* eslint-disable @next/next/no-img-element */

/**
 * A photo with a way to change it. Optional everywhere: no photo simply shows
 * initials, and "Remove" clears it.
 */
export default function PhotoUpload({
  action,
  idField,
  idValue,
  currentUrl,
  label,
  size = 72,
}: {
  action: (formData: FormData) => Promise<void>;
  idField: string;
  idValue: string;
  currentUrl: string | null;
  label: string;
  size?: number;
}) {
  const initials = label
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="group relative">
      {currentUrl ? (
        <img
          src={currentUrl}
          alt={label}
          className="rounded-xl object-cover border border-stone-200"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          className="rounded-xl border border-stone-200 bg-stone-100 text-stone-500 font-bold flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          {initials}
        </span>
      )}

      {/* Expanded preview on hover, absolutely positioned so nothing moves. */}
      {currentUrl && (
        <span className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden group-hover:block bg-white border border-stone-200 rounded-xl p-2 shadow-xl">
          <img src={currentUrl} alt={label} className="w-56 h-56 rounded-lg object-cover" />
        </span>
      )}

      <form action={action} encType="multipart/form-data" className="mt-1.5 flex items-center gap-2">
        <input type="hidden" name={idField} value={idValue} />
        <label className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 cursor-pointer">
          {currentUrl ? "Change" : "Add photo"}
          <input
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
          />
        </label>
        <button type="submit" className="text-[11px] font-semibold text-stone-500 hover:text-stone-800">
          Save
        </button>
        {currentUrl && (
          <button
            type="submit"
            name="remove"
            value="1"
            className="text-[11px] text-stone-400 hover:text-red-600"
          >
            Remove
          </button>
        )}
      </form>
    </div>
  );
}
