import { prisma } from "@/lib/prisma";
import { CoatType, Species, type BreedGuide } from "@prisma/client";
import { formatCoatType, formatSpecies } from "@/lib/utils";
import { PageShell, PageSection } from "@/components/ui";
import { tipLines } from "@/lib/breeds";
import { deleteBreedGuide, saveBreedGuide } from "./actions";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Breed Guide" };

/**
 * The breed reference groomers read at the station. Seeded with widely
 * documented coat characteristics, then owned by the people who groom them —
 * whatever this shop learns about a breed belongs here.
 */

const ERRORS: Record<string, string> = {
  breed_required: "A guide needs a breed name.",
  summary_required: "Write a one-line summary of the coat.",
  duplicate: "There is already a guide for that breed.",
  bad_minutes: "Typical time must be a whole number of minutes.",
};

const inputClass =
  "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm ";

function GuideFields({ guide }: { guide?: BreedGuide }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <label className="text-sm">
          <span className="block font-medium text-stone-700 mb-1">Breed</span>
          <input name="breed" required defaultValue={guide?.breed ?? ""} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="block font-medium text-stone-700 mb-1">Species</span>
          <select name="species" defaultValue={guide?.species ?? Species.DOG} className={inputClass}>
            {Object.values(Species).map((species) => (
              <option key={species} value={species}>
                {formatSpecies(species)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block font-medium text-stone-700 mb-1">Coat</span>
          <select name="coat" defaultValue={guide?.coat ?? ""} className={inputClass}>
            <option value="">Not specified</option>
            {Object.values(CoatType).map((coat) => (
              <option key={coat} value={coat}>
                {formatCoatType(coat)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block font-medium text-stone-700 mb-1">Typical minutes</span>
          <input
            name="typicalMins"
            inputMode="numeric"
            defaultValue={guide?.typicalMins ?? ""}
            className={inputClass}
          />
        </label>
      </div>

      <label className="text-sm block">
        <span className="block font-medium text-stone-700 mb-1">Summary</span>
        <input
          name="summary"
          required
          defaultValue={guide?.summary ?? ""}
          placeholder="What to expect from the coat and the groom."
          className={inputClass}
        />
      </label>

      <label className="text-sm block">
        <span className="block font-medium text-stone-700 mb-1">Tips</span>
        <textarea
          name="tips"
          rows={4}
          defaultValue={guide?.tips ?? ""}
          placeholder={"One per line — they are shown as bullets at the station."}
          className={`${inputClass} resize-y`}
        />
      </label>
    </div>
  );
}

interface PageProps {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}

export default async function BreedGuidesPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const guides = await prisma.breedGuide.findMany({
    orderBy: [{ species: "asc" }, { breed: "asc" }],
  });

  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <PageShell
      title="Breed Guide"
      subtitle={
        <>
          {guides.length} breed{guides.length !== 1 ? "s" : ""} on file. Shown at the station when a
          pet&apos;s breed matches — the pet&apos;s own notes always come first.
        </>
      }
    >

      {searchParams.saved && (
        <p className="border-t border-stone-100 bg-green-50 text-green-800 px-3 py-2 text-sm font-medium">
          Saved {searchParams.saved}.
        </p>
      )}
      {searchParams.deleted === "1" && (
        <p className="border-t border-stone-100 bg-green-50 text-green-800 px-3 py-2 text-sm font-medium">
          Guide removed.
        </p>
      )}
      {errorMessage && (
        <p className="border-t border-stone-100 bg-red-50 text-red-800 px-3 py-2 text-sm font-medium">
          {errorMessage}
        </p>
      )}

      <details className="border-t border-stone-100">
        <summary className="px-3 py-2 cursor-pointer text-sm font-semibold text-stone-800">
          + Add a breed
        </summary>
        <form action={saveBreedGuide} className="px-3 pb-3 pt-1 border-t border-stone-100 space-y-3">
          <GuideFields />
          <div className="flex justify-end">
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-2 rounded-lg text-sm font-semibold"
            >
              Add Guide
            </button>
          </div>
        </form>
      </details>

      {guides.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          No breed guides yet.
        </PageSection>
      ) : (
        <PageSection grow scroll padded={false} bodyClassName="divide-y divide-stone-100">
          {guides.map((guide) => (
            <details key={guide.id}>
              <summary className="px-3 py-2 cursor-pointer flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-semibold text-stone-900">{guide.breed}</span>
                  <span className="block text-xs text-stone-400 truncate">{guide.summary}</span>
                </span>
                <span className="text-xs text-stone-400 whitespace-nowrap">
                  {formatSpecies(guide.species)}
                  {guide.coat && ` · ${formatCoatType(guide.coat)}`}
                  {guide.typicalMins && ` · ${guide.typicalMins} min`}
                  {` · ${tipLines(guide).length} tips`}
                </span>
              </summary>
              <div className="px-3 pb-3 border-t border-stone-100 pt-3 space-y-3">
                <form action={saveBreedGuide} className="space-y-3">
                  <input type="hidden" name="id" value={guide.id} />
                  <GuideFields guide={guide} />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-2 rounded-lg text-sm font-semibold"
                    >
                      Save
                    </button>
                  </div>
                </form>
                <form action={deleteBreedGuide} className="flex justify-end">
                  <input type="hidden" name="id" value={guide.id} />
                  <button type="submit" className="text-xs text-stone-400 hover:text-red-600 underline">
                    Remove this guide
                  </button>
                </form>
              </div>
            </details>
          ))}
        </PageSection>
      )}
    </PageShell>
  );
}
