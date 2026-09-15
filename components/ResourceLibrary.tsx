"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageSection } from "@/components/ui";
import {
  countEntries,
  filterSections,
  type ResourceSection,
} from "@/lib/resources";

/**
 * The bench reference, with a search box over it.
 *
 * Everything here is static text the server already holds, so filtering is a
 * client-side pass over an array rather than a round trip — a groomer with wet
 * hands types "1/4" and the blade row is on screen before they lift them.
 *
 * Search is what makes the closed cards workable. `<details>` is still the
 * mechanism, so a card opens where it stands and the browser's own in-page
 * search still reaches it; a match simply forces the card open so nobody has
 * to go looking for which one lit up.
 */
export default function ResourceLibrary({
  sections,
  breedCount,
}: {
  sections: ResourceSection[];
  breedCount: number;
}) {
  const [query, setQuery] = useState("");
  const filtering = query.trim().length > 0;

  const matches = useMemo(
    () => filterSections(sections, query),
    [sections, query]
  );
  const matchCount = countEntries(matches);

  return (
    <>
      <PageSection tone="muted">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a blade, a coat, a procedure…"
            aria-label="Search the bench reference"
            className="flex-1 min-w-0 sm:max-w-md border border-stone-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          />
          <p className="text-xs text-stone-500 tabular-nums" aria-live="polite">
            {filtering
              ? `${matchCount} ${matchCount === 1 ? "entry" : "entries"} in ${matches.length} ${matches.length === 1 ? "section" : "sections"}`
              : `${countEntries(sections)} entries across ${sections.length} sections`}
          </p>
        </div>
      </PageSection>

      <PageSection grow scroll padded={false}>
        <div className="px-3 py-3 space-y-2">
          <Link
            href={
              filtering
                ? `/staff/resources/breeds?q=${encodeURIComponent(query.trim())}`
                : "/staff/resources/breeds"
            }
            className="group flex items-center gap-3 rounded-lg border border-well-line bg-well px-3 py-2.5 hover:bg-white transition-colors"
          >
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-stone-900 group-hover:text-brand-text transition-colors">
                Breed guide
              </span>
              <span className="block text-sm text-stone-500">
                {filtering
                  ? `Look “${query.trim()}” up in the breed guide too.`
                  : "Coat, typical time and what this shop has learned."}
              </span>
            </span>
            <span className="text-xs text-stone-500 tabular-nums shrink-0">
              {breedCount} {breedCount === 1 ? "breed" : "breeds"}
            </span>
          </Link>

          {matches.map((section) => (
            <ResourceCard
              // Remounting on the way in and out of a search resets the DOM's
              // own open state, so leaving the box empty closes what the search
              // opened rather than leaving five cards spread down the page.
              key={`${section.slug}-${filtering}`}
              section={section}
              open={filtering}
            />
          ))}

          {matches.length === 0 && (
            <p className="rounded-lg border border-well-line bg-well px-3 py-6 text-sm text-stone-500">
              Nothing on the bench reference matches “{query.trim()}”. The breed
              guide above searches separately — try it there.
            </p>
          )}
        </div>
      </PageSection>
    </>
  );
}

function ResourceCard({
  section,
  open,
}: {
  section: ResourceSection;
  open: boolean;
}) {
  // Every blade and comb carries a length, and a column of lengths is what
  // makes the chart readable. A section where all the entries are qualified
  // that way gets the aligned layout; prose sections keep the loose grid.
  const aligned = section.entries.every((entry) => entry.note);

  return (
    <details
      id={section.slug}
      open={open}
      className="disclosure rounded-lg border border-well-line bg-well scroll-mt-4"
    >
      <summary className="px-3 py-2.5">
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-stone-900">{section.title}</span>
          <span className="block text-sm text-stone-500">{section.blurb}</span>
        </span>
        <span className="text-xs text-stone-500 tabular-nums shrink-0">
          {section.entries.length} {section.entries.length === 1 ? "entry" : "entries"}
        </span>
      </summary>

      <div className="border-t border-well-line px-3 py-3">
        {section.caution && (
          <p className="text-sm text-stone-700 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 max-w-3xl">
            {section.caution}
          </p>
        )}

        {aligned ? (
          // Full-bleed so the card's own striping reads as table rows rather
          // than as bands floating inside the padding.
          <dl className="-mx-3 mt-3 first:mt-0 divide-y divide-well-line">
            {section.entries.map((entry) => (
              <div
                key={entry.term}
                className="px-3 py-1.5 sm:grid sm:grid-cols-[6rem_10rem_1fr] sm:gap-x-4 sm:items-baseline"
              >
                <dt className="font-bold text-stone-900">{entry.term}</dt>
                <dd className="text-sm text-stone-500 tabular-nums">{entry.note}</dd>
                <dd className="text-sm text-stone-600">{entry.detail}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3 mt-3 first:mt-0">
            {section.entries.map((entry) => (
              <div key={entry.term}>
                <dt className="text-sm font-bold text-stone-900">
                  {entry.term}
                  {entry.note && (
                    <span className="ml-2 font-medium text-xs text-stone-500 tabular-nums">
                      {entry.note}
                    </span>
                  )}
                </dt>
                <dd className="text-sm text-stone-600 mt-0.5">{entry.detail}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </details>
  );
}
