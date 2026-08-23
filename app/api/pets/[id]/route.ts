import { auth } from "@/lib/auth";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { CoatType, Species } from "@prisma/client";

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
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;
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
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;
  const { pet: existing, error, status } = await resolvePet(id, session);
  if (error) return NextResponse.json({ error }, { status });

  if (!existing!.isActive) {
    return NextResponse.json({ error: "Pet is inactive and cannot be updated" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    name,
    species,
    breed,
    dateOfBirth,
    weightLbs,
    coatType,
    temperamentNotes,
    healthFlags,
    groomingNotes,
    photoUrl,
  } = body as Record<string, unknown>;

  // Validate enums
  if (species && !Object.values(Species).includes(species as Species)) {
    return NextResponse.json({ error: "Invalid species" }, { status: 400 });
  }
  if (coatType && !Object.values(CoatType).includes(coatType as CoatType)) {
    return NextResponse.json({ error: "Invalid coatType" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  const b = body as Record<string, unknown>;

  if ("name" in b) {
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    data.name = (name as string).trim();
  }
  if ("species" in b) data.species = species;
  if ("breed" in b) data.breed = breed ?? null;
  if ("coatType" in b) data.coatType = coatType ?? null;
  if ("temperamentNotes" in b) data.temperamentNotes = temperamentNotes ?? null;
  if ("groomingNotes" in b) data.groomingNotes = groomingNotes ?? null;
  if ("photoUrl" in b) data.photoUrl = photoUrl ?? null;
  if ("weightLbs" in b) data.weightLbs = weightLbs != null ? Number(weightLbs) : null;
  if ("healthFlags" in b) {
    data.healthFlags = Array.isArray(healthFlags) ? (healthFlags as string[]) : [];
  }
  if ("dateOfBirth" in b) {
    if (dateOfBirth == null) {
      data.dateOfBirth = null;
    } else {
      const parsed = new Date(dateOfBirth as string);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid dateOfBirth" }, { status: 400 });
      }
      data.dateOfBirth = parsed;
    }
  }

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
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.userType !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = params;

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
