import { prisma } from "@/lib/prisma";

/**
 * Optional profile photos for customers and pets.
 *
 * Small images live in Postgres: one thing to back up, nothing lost on
 * redeploy, and no object store to run for a single-shop deployment.
 */

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type PhotoError = "too_large" | "bad_type";

/**
 * Store an uploaded image. Returns the new photo's id, null when no file was
 * supplied, or an error code when the file is unusable.
 */
export async function storePhoto(
  file: FormDataEntryValue | null
): Promise<{ id: string } | { error: PhotoError } | null> {
  if (!file || typeof file === "string") return null;
  if (file.size === 0) return null;
  if (file.size > MAX_PHOTO_BYTES) return { error: "too_large" };
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return { error: "bad_type" };

  const data = Buffer.from(await file.arrayBuffer());
  const photo = await prisma.photo.create({
    data: { mimeType: file.type, byteSize: data.byteLength, data },
    select: { id: true },
  });
  return { id: photo.id };
}

/** Remove a photo nothing points at any more. */
export async function deletePhotoIfUnused(photoId: string | null): Promise<void> {
  if (!photoId) return;
  const [customers, pets, staff, visits] = await Promise.all([
    prisma.customer.count({ where: { photoId } }),
    prisma.pet.count({ where: { photoId } }),
    prisma.staff.count({ where: { photoId } }),
    // A visit photo holds the same bytes as any profile picture, and its
    // foreign key is RESTRICT, so a delete that ignored it would throw.
    prisma.visitPhoto.count({ where: { photoId } }),
  ]);
  if (customers === 0 && pets === 0 && staff === 0 && visits === 0) {
    await prisma.photo.delete({ where: { id: photoId } }).catch(() => undefined);
  }
}

/** Where a stored photo is served from. */
export function photoUrl(photoId: string | null | undefined): string | null {
  return photoId ? `/api/photos/${photoId}` : null;
}
