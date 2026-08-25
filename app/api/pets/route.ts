import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Species, CoatType, Prisma } from "@prisma/client";
import { parseBody } from "@/lib/api-validation";
import { PhotoUrl } from "@/lib/pet-schema";

const PET_INCLUDE_STAFF = {
  customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
} as const;

const CreateBody = z.object({
  name: z.string().trim().min(1, "name is required"),
  customerId: z.string().min(1).optional(),
  species: z.nativeEnum(Species).default(Species.DOG),
  breed: z.string().nullish(),
  dateOfBirth: z.coerce.date().nullish(),
  weightLbs: z.number().positive().nullish(),
  coatType: z.nativeEnum(CoatType).nullish(),
  temperamentNotes: z.string().nullish(),
  healthFlags: z.array(z.string().min(1)).default([]),
  groomingNotes: z.string().nullish(),
  photoUrl: PhotoUrl.nullish(),
});

// GET /api/pets
// Staff: all active pets (with customer info), filterable by customerId
// Customer: only their own pets
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.userType === "customer") {
    const pets = await prisma.pet.findMany({
      where: { customerId: session.user.id, isActive: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(pets);
  }

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");
  const where: Prisma.PetWhereInput = { isActive: true };
  if (customerId) where.customerId = customerId;

  const pets = await prisma.pet.findMany({
    where,
    include: PET_INCLUDE_STAFF,
    orderBy: [{ customer: { lastName: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json(pets);
}

// POST /api/pets
// Staff can create for any customerId. Customer creates only for themselves.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseBody(req, CreateBody);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  // A customer's own id wins over anything in the body — they never create a
  // pet under someone else's account.
  let targetCustomerId: string;
  if (session.user.userType === "customer") {
    targetCustomerId = session.user.id;
  } else {
    if (!body.customerId) {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 });
    }
    targetCustomerId = body.customerId;
  }

  const customer = await prisma.customer.findUnique({
    where: { id: targetCustomerId },
    select: { id: true, isActive: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  if (!customer.isActive) {
    return NextResponse.json({ error: "Customer account is inactive" }, { status: 400 });
  }

  const pet = await prisma.pet.create({
    data: {
      customerId: targetCustomerId,
      name: body.name,
      species: body.species,
      breed: body.breed ?? null,
      dateOfBirth: body.dateOfBirth ?? null,
      weightLbs: body.weightLbs ?? null,
      coatType: body.coatType ?? null,
      temperamentNotes: body.temperamentNotes ?? null,
      healthFlags: body.healthFlags,
      groomingNotes: body.groomingNotes ?? null,
      photoUrl: body.photoUrl ?? null,
    },
    include: session.user.userType === "staff" ? PET_INCLUDE_STAFF : undefined,
  });

  return NextResponse.json(pet, { status: 201 });
}
