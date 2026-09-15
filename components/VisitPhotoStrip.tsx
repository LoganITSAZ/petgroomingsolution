import { VisitPhotoKind } from "@prisma/client";
import { photoUrl } from "@/lib/photos";
import { sortPhotos } from "@/lib/visit-photos";
import { formatShopDate, formatShopTime } from "@/lib/utils";

/**
 * The photos of one visit, in a row.
 *
 * Shared by the visit screen, the pet's history and the owner's portal, so
 * "before" means the same thing and sits in the same place on all three. It
 * renders what it is handed — deciding which photos an owner may see is
 * `ownerPhotos()`'s job, and the bytes are still gated by /api/photos/[id].
 */

const KIND_LABEL: Record<VisitPhotoKind, string> = {
  BEFORE: "Before",
  AFTER: "After",
  ISSUE: "Noticed",
};

const KIND_CLASS: Record<VisitPhotoKind, string> = {
  BEFORE: "bg-stone-100 text-stone-600",
  AFTER: "bg-green-100 text-green-800",
  // The one that is usually evidence — matting, a hot ear — reads as a flag.
  ISSUE: "bg-amber-100 text-amber-800",
};

export function formatVisitPhotoKind(kind: VisitPhotoKind): string {
  return KIND_LABEL[kind];
}

export interface StripPhoto {
  id: string;
  photoId: string;
  kind: VisitPhotoKind;
  caption: string | null;
  ownerVisible: boolean;
  createdAt: Date;
}

export default function VisitPhotoStrip({
  photos,
  petName,
  showVisibility = false,
  children,
}: {
  photos: StripPhoto[];
  petName: string;
  /** Staff screens say which photos the owner can see; the owner's own cannot. */
  showVisibility?: boolean;
  /** Per-photo controls, rendered under each tile. */
  children?: (photo: StripPhoto) => React.ReactNode;
}) {
  if (photos.length === 0) {
    return <p className="text-sm text-stone-400">No photos of this visit.</p>;
  }

  return (
    <ul className="flex flex-wrap gap-3">
      {sortPhotos(photos).map((photo) => (
        <li key={photo.id} className="w-36">
          {/* Opening the file itself is the zoom: a lightbox would be a client
              component and a browser already does this well. */}
          <a href={photoUrl(photo.photoId) ?? "#"} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl(photo.photoId) ?? ""}
              alt={`${petName}, ${KIND_LABEL[photo.kind].toLowerCase()}`}
              className="w-36 h-36 object-cover rounded-lg border border-stone-200 bg-well"
            />
          </a>
          <div className="mt-1 flex items-center gap-1 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${KIND_CLASS[photo.kind]}`}>
              {KIND_LABEL[photo.kind]}
            </span>
            {showVisibility && photo.ownerVisible && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                Owner sees this
              </span>
            )}
          </div>
          {photo.caption && <p className="text-xs text-stone-600 mt-0.5">{photo.caption}</p>}
          <p className="text-xs text-stone-400">
            {formatShopTime(photo.createdAt)} on {formatShopDate(photo.createdAt)}
          </p>
          {children?.(photo)}
        </li>
      ))}
    </ul>
  );
}
