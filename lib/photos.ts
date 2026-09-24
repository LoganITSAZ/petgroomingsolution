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

/**
 * A canvas `toDataURL()` string, decoded and checked.
 *
 * A drawn signature arrives as text in a form field rather than as a file — a
 * `<canvas>` has no file to post — so the bytes are checked here instead of by
 * the upload path. Same caps as `storePhoto()`: an inflated base64 blob is still
 * an upload, and a `data:` prefix is not a promise about what follows it.
 */
export function decodeImageDataUrl(
  value: FormDataEntryValue | null
): { mimeType: string; data: Buffer } | { error: PhotoError } | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const match = value.match(/^data:([a-z/+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return { error: "bad_type" };

  const [, mimeType, base64] = match;
  if (!ALLOWED_PHOTO_TYPES.includes(mimeType.toLowerCase())) return { error: "bad_type" };
  const data = Buffer.from(base64, "base64");
  if (data.byteLength === 0) return null;
  if (data.byteLength > MAX_PHOTO_BYTES) return { error: "too_large" };
  return { mimeType: mimeType.toLowerCase(), data };
}

/** Store a drawn signature. Same row, same table, same backup as every photo. */
export async function storeImageDataUrl(
  value: FormDataEntryValue | null
): Promise<{ id: string } | { error: PhotoError } | null> {
  const decoded = decodeImageDataUrl(value);
  if (!decoded || "error" in decoded) return decoded;

  const photo = await prisma.photo.create({
    data: { mimeType: decoded.mimeType, byteSize: decoded.data.byteLength, data: decoded.data },
    select: { id: true },
  });
  return { id: photo.id };
}

/** Remove a photo nothing points at any more. */
export async function deletePhotoIfUnused(photoId: string | null): Promise<void> {
  if (!photoId) return;
  const [customers, pets, staff, visits, signatures] = await Promise.all([
    prisma.customer.count({ where: { photoId } }),
    prisma.pet.count({ where: { photoId } }),
    prisma.staff.count({ where: { photoId } }),
    // A visit photo holds the same bytes as any profile picture, and its
    // foreign key is RESTRICT, so a delete that ignored it would throw.
    prisma.visitPhoto.count({ where: { photoId } }),
    // A signature is the record of what somebody agreed to, so it is never
    // orphaned by a profile picture being swapped out.
    prisma.documentAcceptance.count({ where: { signaturePhotoId: photoId } }),
  ]);
  if (customers === 0 && pets === 0 && staff === 0 && visits === 0 && signatures === 0) {
    await prisma.photo.delete({ where: { id: photoId } }).catch(() => undefined);
  }
}

/** Where a stored photo is served from. */
export function photoUrl(photoId: string | null | undefined): string | null {
  return photoId ? `/api/photos/${photoId}` : null;
}
