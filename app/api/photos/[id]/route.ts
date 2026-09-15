import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Serves a stored photo: a profile picture, or a photo of one visit.
 *
 * Photos are of real customers and their pets, so they are not public: staff
 * see any of them, a customer sees only their own and their pets'. The station
 * kiosk is unauthenticated, so it keeps using `Pet.photoUrl` for anything it
 * needs to display.
 *
 * A visit photo reaches an owner only when a groomer ticked `ownerVisible` on
 * it. That clause is load-bearing in both directions: without it an owner
 * cannot see photos of their own dog, and without the tick they would see the
 * shop's own evidence -- a matted belly, an equipment fault.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const photo = await prisma.photo.findUnique({ where: { id: (await params).id } });
  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (session.user.userType === "customer") {
    const owned = await prisma.customer.count({
      where: {
        id: session.user.id,
        OR: [
          { photoId: photo.id },
          { pets: { some: { photoId: photo.id } } },
          {
            appointments: {
              some: { photos: { some: { photoId: photo.id, ownerVisible: true } } },
            },
          },
        ],
      },
    });
    if (owned === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(photo.byteSize),
      // Ids are content-addressed by row, so a photo never changes in place.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
