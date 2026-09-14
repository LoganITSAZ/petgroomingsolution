import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageShell, PageSection } from "@/components/ui";
import { RESOURCE_SECTIONS } from "@/lib/resources";

export const metadata = { title: "Resources" };

// Counts the breed guide, which the shop edits.
export const dynamic = "force-dynamic";

/**
 * The bench reference, open to everyone on the team.
 *
 * The breed guide used to live behind the admin panel, which meant the people
 * who actually needed it at the table were the ones who could not open it.
 * Everything here is read-only and reachable from the floor; editing the breed
 * guide stays with whoever runs the shop.
 *
 * Every section is a closed card. The page used to print all five in full with
 * a grid of anchor links above them, so the same five titles appeared twice and
 * a groomer looking up a blade number scrolled past the bite procedure to get
 * there. A card opens where it stands — native `<details>`, so it is keyboard
 * reachable, announced, and found by the browser's own in-page search.
 */
export default async function ResourcesPage() {
  const breedCount = await prisma.breedGuide.count();

  return (
    <PageShell
      title="Resources"
      subtitle="Guidance, not instruction — the pet's own notes always come first"
    >
      <PageSection grow scroll padded={false}>
        <div className="px-3 py-3 space-y-2">
          <Link
            href="/staff/resources/breeds"
            className="group flex items-center gap-3 rounded-lg border border-well-line bg-well px-3 py-2.5 hover:bg-white transition-colors"
          >
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-stone-900 group-hover:text-brand-text transition-colors">
                Breed guide
              </span>
              <span className="block text-sm text-stone-500">
                Coat, typical time and what this shop has learned.
              </span>
            </span>
            <span className="text-xs text-stone-500 tabular-nums shrink-0">
              {breedCount} {breedCount === 1 ? "breed" : "breeds"}
            </span>
          </Link>

          {RESOURCE_SECTIONS.map((section) => (
            <details
              key={section.slug}
              id={section.slug}
              className="disclosure rounded-lg border border-well-line bg-well scroll-mt-4"
            >
              <summary className="px-3 py-2.5">
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-stone-900">{section.title}</span>
                  <span className="block text-sm text-stone-500">{section.blurb}</span>
                </span>
                <span className="text-xs text-stone-500 tabular-nums shrink-0">
                  {section.entries.length}
                </span>
              </summary>

              <div className="border-t border-well-line px-3 py-3">
                {section.caution && (
                  <p className="text-sm text-stone-700 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 max-w-3xl">
                    {section.caution}
                  </p>
                )}
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
              </div>
            </details>
          ))}
        </div>
      </PageSection>
    </PageShell>
  );
}
