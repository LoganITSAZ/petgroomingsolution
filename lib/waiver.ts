import { prisma } from "@/lib/prisma";

/**
 * Waiver versions are normally derived, not typed: publishing changed text
 * bumps the version automatically so customers get re-prompted. An explicit
 * version is still accepted — restoring an earlier revision has to be able to
 * put its original number back.
 */

/** Increment the trailing number: "1.0" → "1.1", "2" → "3", "v3.9" → "v3.10". */
export function bumpVersion(current: string | null | undefined): string {
  const value = (current ?? "").trim();
  if (!value) return "1.0";

  const match = value.match(/^(.*?)(\d+)$/);
  if (!match) return `${value}.1`;

  const [, prefix, digits] = match;
  return `${prefix}${Number(digits) + 1}`;
}

/** The next version that is not already taken by a stored revision. */
export async function nextAvailableVersion(current: string | null | undefined): Promise<string> {
  let candidate = bumpVersion(current);
  // Bounded: each miss consumes one version number, so this cannot spin.
  for (let attempt = 0; attempt < 100; attempt++) {
    const taken = await prisma.waiverRevision.findUnique({ where: { version: candidate } });
    if (!taken) return candidate;
    candidate = bumpVersion(candidate);
  }
  return `${candidate}-${Date.now()}`;
}

/**
 * Store the text of a version so it can be restored later.
 * Re-publishing the same version overwrites its text.
 */
export async function recordRevision(
  version: string,
  text: string,
  staffId?: string
): Promise<void> {
  await prisma.waiverRevision.upsert({
    where: { version },
    update: { text, createdById: staffId ?? undefined },
    create: { version, text, createdById: staffId ?? null },
  });
}
