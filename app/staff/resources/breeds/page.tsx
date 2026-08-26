import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCoatType, formatSpecies } from "@/lib/utils";
import { currentStaffCanManage } from "@/lib/staff-roles";
import { PageShell, PageSection } from "@/components/ui";
import { tipLines } from "@/lib/breeds";

export const metadata = { title: "Breed Guide" };

export const dynamic = "force-dynamic";

/**
 * The breed reference, read-only and open to the whole team.
 *
 * The station screen already shows the guide for the pet in hand; this is the
 * same content when someone wants to look a breed up before it arrives.
 * Editing stays at /admin/breeds and is linked from here for whoever runs the
 * shop, so there is still exactly one screen that owns changing a guide.
 */
export default async function StaffBreedGuidePage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const query = (searchParams.q ?? "").trim();

  const [guides, canManageShop] = await Promise.all([
    prisma.breedGuide.findMany({
      where: query
        ? {
            OR: [
              { breed: { contains: query, mode: "insensitive" } },
              { summary: { contains: query, mode: "insensitive" } },
              { tips: { contains: query, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { breed: "asc" },
    }),
    currentStaffCanManage(),
  ]);

  return (
    <PageShell
      title="Breed Guide"
      subtitle={`${guides.length} ${guides.length === 1 ? "breed" : "breeds"}`}
      back={{ href: "/staff/resources", label: "Resources" }}
      actions={
        canManageShop ? (
          <Link
            href="/admin/breeds"
            className="text-sm font-bold px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors"
          >
            Edit guides
          </Link>
        ) : undefined
      }
    >
      <PageSection tone="muted">
        <form method="get" className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search a breed, a coat, a note…"
            aria-label="Search the breed guide"
            className="flex-1 max-w-md border border-stone-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          />
          <button
            type="submit"
            className="text-sm font-bold px-3 py-1.5 rounded-lg bg-brand-600 text-brand-on-600 hover:bg-brand-700 hover:text-brand-on-700 transition-colors"
          >
            Search
          </button>
          {query && (
            <Link href="/staff/resources/breeds" className="text-sm text-stone-500 hover:text-stone-800">
              Clear
            </Link>
          )}
        </form>
      </PageSection>

      <PageSection>
        <p className="text-sm text-stone-600">
          Widely documented coat characteristics, then whatever this shop has learned since. It is
          guidance — the pet&apos;s own grooming and temperament notes come first, every time.
        </p>
      </PageSection>

      <PageSection grow scroll padded={false}>
        {guides.length === 0 ? (
          <p className="px-3 py-6 text-sm text-stone-500">
            {query ? (
              <>
                No breed matches “{query}”.{" "}
                <Link href="/staff/resources/breeds" className="text-brand-text font-bold hover:underline">
                  Show every breed
                </Link>
                .
              </>
            ) : (
              "No breed guides yet."
            )}
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {guides.map((guide) => {
              const tips = tipLines(guide);
              return (
                <li key={guide.id} className="px-3 py-3">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h2 className="font-bold text-stone-900">{guide.breed}</h2>
                    <span className="text-xs text-stone-500">{formatSpecies(guide.species)}</span>
                    {guide.coat && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">
                        {formatCoatType(guide.coat)}
                      </span>
                    )}
                    {guide.typicalMins != null && (
                      <span className="text-xs text-stone-500 tabular-nums">
                        ~{guide.typicalMins} min
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-stone-600 mt-1">{guide.summary}</p>
                  {tips.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {tips.map((tip) => (
                        <li key={tip} className="text-sm text-stone-600 pl-3 -indent-3">
                          <span className="text-stone-400">·</span> {tip}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PageSection>
    </PageShell>
  );
}
