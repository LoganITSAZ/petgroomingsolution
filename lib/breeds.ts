import { prisma } from "@/lib/prisma";
import { Species, type BreedGuide } from "@prisma/client";

/**
 * Breed reference shown at the station.
 *
 * The guide is the shop's own: seeded with widely documented coat
 * characteristics, then edited by the people who actually groom them. It is a
 * job aid, never an instruction — the pet's own notes always outrank it.
 */

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

/**
 * A stock photo for a breed, from Wikipedia's own picture for the article.
 *
 * Filled in when a manager adds a guide without pasting a link — nobody is
 * going hunting for a picture of a Havanese while writing down what its coat
 * does. It is a one-off lookup stored on the row, not something read per
 * render, and it never throws: no photo is a card with a letter in it.
 */
export async function stockPhotoForBreed(
  breed: string,
  species: Species
): Promise<string | null> {
  const term = `${breed} ${species === Species.CAT ? "cat" : "dog"} breed`;
  const query = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: term,
    gsrlimit: "1",
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: "800",
  });

  try {
    const response = await fetch(`https://en.wikipedia.org/w/api.php?${query}`, {
      // Wikimedia asks for an identifying agent and refuses anonymous scripts.
      headers: { "User-Agent": "gentlegroomer/1.0 (shop grooming app)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const page = (await response.json())?.query?.pages?.[0];
    return acceptStockPhoto(breed, page?.title, page?.thumbnail?.source);
  } catch {
    return null;
  }
}

/**
 * The guard on that lookup: search always returns its best guess, and its best
 * guess for a breed Wikipedia has no article on is a different animal. A
 * "Bernedoodle" that comes back as "List of dog crossbreeds" is a picture of
 * somebody else's dog at the station, which is worse than no picture at all.
 *
 * Loose both ways, like `guidesForBreeds()`: "Persian" may answer "Persian
 * cat", "Standard Poodle" may answer "Poodle".
 */
export function acceptStockPhoto(
  breed: string,
  title: unknown,
  url: unknown
): string | null {
  if (typeof title !== "string" || typeof url !== "string" || !url) return null;
  const needle = breed.trim().toLowerCase();
  const found = title.trim().toLowerCase();
  if (!needle || (!found.includes(needle) && !needle.includes(found))) return null;
  // The API tags its URLs with campaign parameters and hands back a CDN alias
  // that is not the canonical host; both belong in the log, not on the row.
  return url.split("?")[0].replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/");
}
