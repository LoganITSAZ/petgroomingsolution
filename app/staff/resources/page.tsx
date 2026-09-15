import { prisma } from "@/lib/prisma";
import { PageShell } from "@/components/ui";
import ResourceLibrary from "@/components/ResourceLibrary";
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
 * The sections are static text, so the page is a count and a shell over
 * [ResourceLibrary](../../../components/ResourceLibrary.tsx), which owns the
 * search box and the cards.
 */
export default async function ResourcesPage() {
  const breedCount = await prisma.breedGuide.count();

  return (
    <PageShell
      title="Resources"
      subtitle="Guidance, not instruction — the pet's own notes always come first"
    >
      <ResourceLibrary sections={RESOURCE_SECTIONS} breedCount={breedCount} />
    </PageShell>
  );
}
