import { auth } from "@/lib/auth";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { CoatType, Prisma, Species } from "@prisma/client";
import { z } from "zod";
import { parseBody } from "@/lib/api-validation";
import { PhotoUrl } from "@/lib/pet-schema";

// Every field optional: a PATCH applies only the keys it actually sends.
// species has no nullable form — the column is non-nullable, so `null` here is
// a 400 rather than the 500 it used to produce further down in Prisma.
const PatchBody = z.object({
  name: z.string().trim().min(1, "name cannot be empty").optional(),
  species: z.nativeEnum(Species).optional(),
  breed: z.string().nullish(),
  dateOfBirth: z.coerce.date().nullish(),
  weightLbs: z.number().positive().nullish(),
  coatType: z.nativeEnum(CoatType).nullish(),
  temperamentNotes: z.string().nullish(),
  healthFlags: z.array(z.string().min(1)).optional(),
  groomingNotes: z.string().nullish(),
  photoUrl: PhotoUrl.nullish(),
});

const PET_FULL_INCLUDE = {
  customer: {
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  },
  appointments: {
    orderBy: { scheduledAt: "desc" as const },
    take: 20,
    include: {
      station: { select: { id: true, name: true } },
      staff: { select: { id: true, name: true } },
    },
  },
} as const;

async function resolvePet(id: string, session: Session) {
  const pet = await prisma.pet.findUnique({
    where: { id },
    include: PET_FULL_INCLUDE,
  });

  if (!pet) return { pet: null, error: "Pet not found", status: 404 };

  // Customers can only access their own pets
  if (session.user.userType === "customer" && pet.customerId !== session.user.id) {
    return { pet: null, error: "Forbidden", status: 403 };
  }

  return { pet, error: null, status: 200 };
}

// GET /api/pets/[id]
// Auth: staff sees all; customer sees only their own
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { pet, error, status } = await resolvePet(id, session);
  if (error) return NextResponse.json({ error }, { status });

  return NextResponse.json(pet);
}

// PATCH /api/pets/[id]
// Auth: staff sees all; customer updates only their own
// Updatable: name, species, breed, dateOfBirth, weightLbs, coatType,
//            temperamentNotes, healthFlags, groomingNotes, photoUrl
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { pet: existing, error, status } = await resolvePet(id, session);
  if (error) return NextResponse.json({ error }, { status });

  if (!existing!.isActive) {
    return NextResponse.json({ error: "Pet is inactive and cannot be updated" }, { status: 400 });
  }

  const parsed = await parseBody(req, PatchBody);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  // Only the keys the caller sent are written, so an omitted field keeps its
  // current value while an explicit null clears it.
  const data: Prisma.PetUpdateInput = {};
  if ("name" in body) data.name = body.name;
  if ("species" in body) data.species = body.species;
  if ("breed" in body) data.breed = body.breed ?? null;
  if ("dateOfBirth" in body) data.dateOfBirth = body.dateOfBirth ?? null;
  if ("weightLbs" in body) data.weightLbs = body.weightLbs ?? null;
  if ("coatType" in body) data.coatType = body.coatType ?? null;
  if ("temperamentNotes" in body) data.temperamentNotes = body.temperamentNotes ?? null;
  if ("healthFlags" in body) data.healthFlags = body.healthFlags;
  if ("groomingNotes" in body) data.groomingNotes = body.groomingNotes ?? null;
  if ("photoUrl" in body) data.photoUrl = body.photoUrl ?? null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const updated = await prisma.pet.update({
    where: { id },
    data,
    include: PET_FULL_INCLUDE,
  });

  return NextResponse.json(updated);
}

// DELETE /api/pets/[id]
// Auth: staff only (customers cannot delete pets via API)
// Soft delete: sets isActive = false
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.userType !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.pet.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  if (!existing.isActive) {
    return NextResponse.json({ error: "Pet is already inactive" }, { status: 409 });
  }

  const updated = await prisma.pet.update({
    where: { id },
    data: { isActive: false },
    include: PET_FULL_INCLUDE,
  });

  return NextResponse.json(updated);
}
