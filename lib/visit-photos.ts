/**
 * Photographs of one day's work.
 *
 * A shop takes a **before** so a coat that had to come off is on the record,
 * an **after** because the finished dog is the work, and an **issue** photo
 * for whatever somebody noticed — matting, a hot ear, a nail already split.
 * All three belong to the visit: `Pet.photoId` is the face that identifies
 * the dog, and a June shave-down is not the dog's portrait.
 *
 * No database here. The rows come from the page that already loaded the
 * visit; this module only decides order, which pair is the record, and what
 * the owner may see — same shape as lib/visit-record.ts next door.
 */

import { prisma } from "@/lib/prisma";
import { VisitPhotoKind } from "@prisma/client";

/** The little a display decision needs off a photo row. */
export interface PhotoRow {
  id: string;
  kind: VisitPhotoKind;
  ownerVisible: boolean;
  createdAt: Date;
}

/** Before, then after, then issues. */
const KIND_ORDER: VisitPhotoKind[] = [
  VisitPhotoKind.BEFORE,
  VisitPhotoKind.AFTER,
  VisitPhotoKind.ISSUE,
];

/** Display order: by kind, and oldest first inside a kind. */
export function sortPhotos<T extends PhotoRow>(photos: T[]): T[] {
  return [...photos].sort((a, b) => {
    const byKind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    return byKind !== 0 ? byKind : a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/**
 * The pair a groom is judged on. Either side may be missing — a walk-in
 * nobody photographed on arrival still has an after.
 *
 * The **latest** of each kind wins, not the first: a groomer who reshoots a
 * blurred photo expects the new one to be the one shown, and that is cheaper
 * than a supersedes column or deleting the old row.
 */
export function beforeAfter<T extends PhotoRow>(photos: T[]): { before: T | null; after: T | null } {
  const latest = (kind: VisitPhotoKind) =>
    photos
      .filter((photo) => photo.kind === kind)
      .reduce<T | null>(
        (best, photo) => (!best || photo.createdAt >= best.createdAt ? photo : best),
        null
      );
  return { before: latest(VisitPhotoKind.BEFORE), after: latest(VisitPhotoKind.AFTER) };
}

/**
 * What the owner may see, in display order.
 *
 * Opt-in per photo, like `VisitEvent.ownerVisible`: an issue photo is often
 * the shop's own evidence, and a matted belly is not something every owner
 * wants sent to them.
 */
export function ownerPhotos<T extends PhotoRow>(photos: T[]): T[] {
  return sortPhotos(photos.filter((photo) => photo.ownerVisible));
}

/**
 * The kind named by a posted form field, or null.
 *
 * `Object.hasOwn` rather than `in`, or `"toString"` passes as a kind and the
 * enum column rejects it — the same trap `readTheme()` avoids.
 */
export function readKind(value: unknown): VisitPhotoKind | null {
  return typeof value === "string" && Object.hasOwn(VisitPhotoKind, value)
    ? VisitPhotoKind[value as VisitPhotoKind]
    : null;
}

/**
 * The last finished-groom photo for each pet -- the cut to repeat.
 *
 * One query for a whole station board, the same shape as
 * `lastGroomRecordsForPets()`. Excludes the visit on the screen: a groomer
 * wants the previous cut, not the photo they took ten minutes ago.
 */
export async function lastAfterPhotoForPets(
  petIds: string[],
  exceptAppointmentId?: string
): Promise<Map<string, { photoId: string; takenAt: Date }>> {
  const unique = [...new Set(petIds)];
  if (unique.length === 0) return new Map();

  const rows = await prisma.visitPhoto.findMany({
    where: {
      kind: VisitPhotoKind.AFTER,
      appointment: {
        petId: { in: unique },
        id: exceptAppointmentId ? { not: exceptAppointmentId } : undefined,
      },
    },
    select: { photoId: true, createdAt: true, appointment: { select: { petId: true } } },
    orderBy: { createdAt: "desc" },
  });

  const byPet = new Map<string, { photoId: string; takenAt: Date }>();
  for (const row of rows) {
    // Rows arrive newest first, so the first one seen for a pet is the answer.
    if (!byPet.has(row.appointment.petId)) {
      byPet.set(row.appointment.petId, { photoId: row.photoId, takenAt: row.createdAt });
    }
  }
  return byPet;
}
