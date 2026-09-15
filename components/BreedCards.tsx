"use client";

import { useState } from "react";
import type { BreedGuide } from "@prisma/client";
import Modal from "@/components/Modal";
import { tipLines } from "@/lib/breeds";
import { formatCoatType, formatSpecies } from "@/lib/utils";

/**
 * The breed guide as a wall of pictures.
 *
 * A groomer looking a breed up before it arrives is usually checking what the
 * coat looks like, and a list of paragraphs answered that badly. The card is
 * the photo plus the one line that decides whether to open it; the tips — the
 * part you read with your hands full — go in the dialog, where nothing else is
 * on screen.
 *
 * The photo is a link the shop pasted, so it is `<img>` rather than
 * `next/image`: no remote host allowlist to keep in step with whatever a
 * manager finds. A dead link hides the frame instead of printing a broken icon.
 */

function Meta({ guide }: { guide: BreedGuide }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
      <span>{formatSpecies(guide.species)}</span>
      {guide.coat && (
        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-700">
          {formatCoatType(guide.coat)}
        </span>
      )}
      {guide.typicalMins != null && (
        <span className="tabular-nums">~{guide.typicalMins} min</span>
      )}
    </div>
  );
}

function Photo({
  guide,
  className,
}: {
  guide: BreedGuide;
  className: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!guide.photoUrl || failed) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-well text-3xl font-black text-stone-300`}
        aria-hidden="true"
      >
        {guide.breed.slice(0, 1)}
      </div>
    );
  }
  return (
    <img
      src={guide.photoUrl}
      alt={guide.breed}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${className} bg-well object-cover`}
    />
  );
}

export default function BreedCards({ guides }: { guides: BreedGuide[] }) {
  const [open, setOpen] = useState<BreedGuide | null>(null);
  const tips = open ? tipLines(open) : [];

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 px-3 py-3 sm:grid-cols-3 lg:grid-cols-4">
        {guides.map((guide) => (
          <li key={guide.id}>
            <button
              type="button"
              onClick={() => setOpen(guide)}
              className="w-full overflow-hidden rounded-lg border border-well-line bg-white text-left transition-colors hover:bg-well focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <Photo guide={guide} className="aspect-[4/3] w-full" />
              <div className="space-y-1 p-2.5">
                <h2 className="font-bold text-stone-900">{guide.breed}</h2>
                <Meta guide={guide} />
                <p className="line-clamp-2 text-sm text-stone-600">{guide.summary}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        labelledBy="breed-dialog-title"
        className="max-w-lg"
      >
        {open && (
          <div className="space-y-3">
            <Photo guide={open} className="aspect-[4/3] w-full rounded-lg" />
            <div className="space-y-1">
              <h2 id="breed-dialog-title" className="text-lg font-black text-stone-900">
                {open.breed}
              </h2>
              <Meta guide={open} />
            </div>
            <p className="text-sm text-stone-700">{open.summary}</p>
            {tips.length > 0 && (
              <ul className="space-y-1">
                {tips.map((tip) => (
                  <li key={tip} className="-indent-3 pl-3 text-sm text-stone-700">
                    <span className="text-stone-400">·</span> {tip}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-stone-500">
              Guidance, not instruction — the pet&apos;s own grooming and temperament notes come
              first.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-bold text-stone-700 transition-colors hover:bg-stone-50"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
