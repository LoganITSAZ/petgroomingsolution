import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageShell, PageSection, Panel } from "@/components/ui";
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
 */
export default async function ResourcesPage() {
  const breedCount = await prisma.breedGuide.count();

  return (
    <PageShell
      title="Resources"
      subtitle="Guidance, not instruction — the pet's own notes always come first"
    >
      <PageSection tone="muted" padded={false}>
        <div className="px-3 py-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/staff/resources/breeds"
            className="group rounded-lg border border-stone-200 bg-white px-3 py-3 hover:border-stone-300 hover:shadow-sm transition-all"
          >
            <span className="block font-bold text-stone-900 group-hover:text-brand-text transition-colors">
              Breed guide
            </span>
            <span className="block text-sm text-stone-500 mt-0.5">
              Coat, typical time and what this shop has learned, for {breedCount}{" "}
              {breedCount === 1 ? "breed" : "breeds"}.
            </span>
          </Link>
          {RESOURCE_SECTIONS.map((section) => (
            <a
              key={section.slug}
              href={`#${section.slug}`}
              className="group rounded-lg border border-stone-200 bg-white px-3 py-3 hover:border-stone-300 hover:shadow-sm transition-all"
            >
              <span className="block font-bold text-stone-900 group-hover:text-brand-text transition-colors">
                {section.title}
              </span>
              <span className="block text-sm text-stone-500 mt-0.5">{section.blurb}</span>
            </a>
          ))}
        </div>
      </PageSection>

      <PageSection grow scroll padded={false}>
        <div className="divide-y divide-stone-100">
          {RESOURCE_SECTIONS.map((section) => (
            <section key={section.slug} id={section.slug} className="px-3 py-4 scroll-mt-4">
              <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest">
                {section.title}
              </h2>
              <p className="text-sm text-stone-600 mt-1 max-w-3xl">{section.blurb}</p>
              {section.caution && (
                <Panel title="Worth knowing" className="mt-2 max-w-3xl">
                  <p className="text-sm text-stone-700">{section.caution}</p>
                </Panel>
              )}
              <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
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
            </section>
          ))}
        </div>
      </PageSection>
    </PageShell>
  );
}
