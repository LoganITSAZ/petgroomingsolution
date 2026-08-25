import { prisma } from "@/lib/prisma";
import type { BreedGuide } from "@prisma/client";

/**
 * Breed reference shown at the station.
 *
 * The guide is the shop's own: seeded with widely documented coat
 * characteristics, then edited by the people who actually groom them. It is a
 * job aid, never an instruction — the pet's own notes always outrank it.
 */

/** Loose match: "Standard Poodle" and "poodle (toy)" both find "Poodle". */
export async function guideForBreed(
  breed: string | null | undefined
): Promise<BreedGuide | null> {
  const needle = breed?.trim().toLowerCase();
  if (!needle) return null;

  const guides = await prisma.breedGuide.findMany();
  return (
    guides.find((guide) => guide.breed.toLowerCase() === needle) ??
    guides.find(
      (guide) =>
        needle.includes(guide.breed.toLowerCase()) ||
        guide.breed.toLowerCase().includes(needle)
    ) ??
    null
  );
}

/** Guides for several breeds at once, keyed by the breed string given. */
export async function guidesForBreeds(
  breeds: (string | null | undefined)[]
): Promise<Map<string, BreedGuide>> {
  const guides = await prisma.breedGuide.findMany();
  const out = new Map<string, BreedGuide>();

  for (const breed of breeds) {
    const needle = breed?.trim().toLowerCase();
    if (!needle || out.has(needle)) continue;
    const match =
      guides.find((guide) => guide.breed.toLowerCase() === needle) ??
      guides.find(
        (guide) =>
          needle.includes(guide.breed.toLowerCase()) ||
          guide.breed.toLowerCase().includes(needle)
      );
    if (match) out.set(needle, match);
  }

  return out;
}

/** Tips are stored one per line. */
export function tipLines(guide: Pick<BreedGuide, "tips">): string[] {
  return guide.tips
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}
