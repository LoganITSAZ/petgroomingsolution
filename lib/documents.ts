import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import type { ShopDocument } from "@prisma/client";

/**
 * The documents a customer signs.
 *
 * One row per document — a liability waiver, a matting release, consent for
 * emergency medical care — each with its own text and its own version, so
 * rewriting one re-prompts for that one and leaves the others signed.
 *
 * `featureWaiverRequired` is the policy: whether anything must be signed before
 * booking. Everything else is emptiness rather than a flag — a shop with one
 * document is asked about one document, and a shop with none asks nothing.
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

/** The next version of *this document* that no stored revision holds. */
export async function nextAvailableVersion(
  documentId: string,
  current: string | null | undefined
): Promise<string> {
  let candidate = bumpVersion(current);
  // Bounded: each miss consumes one version number, so this cannot spin.
  for (let attempt = 0; attempt < 100; attempt++) {
    const taken = await prisma.documentRevision.findUnique({
      where: { documentId_version: { documentId, version: candidate } },
    });
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
  documentId: string,
  version: string,
  text: string,
  staffId?: string
): Promise<void> {
  await prisma.documentRevision.upsert({
    where: { documentId_version: { documentId, version } },
    update: { text, createdById: staffId ?? undefined },
    create: { documentId, version, text, createdById: staffId ?? null },
  });
}

/** Everything a customer is asked to sign, in the order the shop put them in. */
export async function activeDocuments(): Promise<ShopDocument[]> {
  return prisma.shopDocument.findMany({
    where: { isActive: true, body: { not: "" } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * What this customer still owes.
 *
 * Checked per document *and* per version, because bumping a version is how a
 * shop re-prompts, and it is checked at booking rather than only at
 * registration for the same reason.
 */
export async function outstandingDocuments(customerId: string): Promise<ShopDocument[]> {
  const config = await getConfig();
  if (!config.featureWaiverRequired) return [];

  const documents = await activeDocuments();
  if (documents.length === 0) return [];

  const accepted = await prisma.documentAcceptance.findMany({
    where: { customerId, documentId: { in: documents.map((document) => document.id) } },
    select: { documentId: true, version: true },
  });
  const signed = new Set(accepted.map((row) => `${row.documentId}@${row.version}`));
  return documents.filter((document) => !signed.has(`${document.id}@${document.version}`));
}

/**
 * Record one signature against every document being accepted.
 *
 * The signature is written onto each row rather than once beside them: an
 * acceptance has to stand on its own as the record of what that person agreed
 * to, and a row that points at nothing is not a signed document.
 */
export async function acceptDocuments(
  customerId: string,
  documents: Pick<ShopDocument, "id" | "version">[],
  signature: {
    signedName?: string | null;
    signaturePhotoId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  } = {}
): Promise<void> {
  for (const document of documents) {
    await prisma.documentAcceptance.upsert({
      where: {
        customerId_documentId_version: {
          customerId,
          documentId: document.id,
          version: document.version,
        },
      },
      // Already signed is already signed: a second submission must not restamp
      // the time or replace the signature that was given.
      update: {},
      create: {
        customerId,
        documentId: document.id,
        version: document.version,
        signedName: signature.signedName?.trim() || null,
        signaturePhotoId: signature.signaturePhotoId ?? null,
        ipAddress: signature.ipAddress ?? null,
        userAgent: signature.userAgent ?? null,
      },
    });
  }
}
